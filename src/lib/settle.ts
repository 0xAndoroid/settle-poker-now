/**
 * Settlement planner with per-player isolation rules.
 *
 * Pipeline:
 *   1. Apply user adjustments (already-paid transfers) to ledger nets.
 *   2. Resolve isolation rules into a hub-and-spoke topology:
 *      - For each isolated player I → counterpart C, I settles entirely with
 *        C (one forced txn) and folds I.net into C.net.
 *      - Chains collapse transitively (A → B → C is allowed; A folds into B
 *        first, then B (now carrying A's net) folds into C).
 *      - Cycles (A → B, B → A) are detected and the offending players are
 *        removed from settlement with a `cyclePlayerIds` flag — the UI
 *        surfaces the cycle clearly.
 *   3. Run the greedy max-creditor-meets-max-debtor heuristic on the
 *      remaining (non-isolated, non-cycle) players to settle the rest.
 *
 * All arithmetic is in integer cents. Ties between equal-magnitude balances
 * are broken by lexicographic playerId for full determinism.
 */

import {
  type AliasRule,
  buildCanonicalMap,
  collapseAdjustments,
  collapseIsolations,
  collapseRows,
} from './aliases';
import type {
  Adjustment,
  EffectiveBalance,
  IsolationRule,
  LedgerRow,
  SettlementPlan,
  SettlementTxn,
} from './types';

/**
 * Apply already-paid adjustments to the ledger nets. Each adjustment is
 * symmetric: `from` paid `to`, so `from`'s net rises by X (less owed) and
 * `to`'s net drops by X (less owed back). Sum is preserved.
 */
export function applyAdjustments(
  rows: LedgerRow[],
  adjustments: Adjustment[]
): EffectiveBalance[] {
  const byId = new Map<string, EffectiveBalance>();
  for (const row of rows) {
    byId.set(row.playerId, {
      playerId: row.playerId,
      nickname: row.nickname,
      originalNetCents: row.netCents,
      effectiveNetCents: row.netCents,
    });
  }

  for (const adj of adjustments) {
    const from = byId.get(adj.fromId);
    const to = byId.get(adj.toId);
    if (!from || !to) continue; // UI is responsible for stale references
    from.effectiveNetCents += adj.amountCents;
    to.effectiveNetCents -= adj.amountCents;
  }

  return Array.from(byId.values());
}

/**
 * Walk the isolation graph from `start` along the parent chain. Returns
 * either the chain ending in a non-isolated player (terminal hub) or the
 * cycle if one is found.
 */
interface ChainResult {
  chain: string[];
  /** True if the chain ends because the same node was revisited. */
  cycle: boolean;
}

function walkChain(start: string, parent: Map<string, string>): ChainResult {
  const visited = new Set<string>();
  const chain: string[] = [];
  let current: string | undefined = start;
  while (current !== undefined) {
    if (visited.has(current)) {
      // Cycle detected. Return only the cycle nodes (everything from the
      // first visit of `current` onward).
      const cycleStart = chain.indexOf(current);
      return { chain: chain.slice(cycleStart), cycle: true };
    }
    visited.add(current);
    chain.push(current);
    current = parent.get(current);
  }
  return { chain, cycle: false };
}

/**
 * Detect cycles in the isolation graph. Returns the set of player IDs that
 * participate in any cycle. A cycle is rejected wholesale — none of its
 * members settle automatically.
 *
 * Self-loops (player isolated to themselves) are treated as cycles.
 */
function findCyclePlayerIds(
  rules: IsolationRule[],
  validPlayerIds: ReadonlySet<string>
): Set<string> {
  const parent = new Map<string, string>();
  for (const rule of rules) {
    if (!validPlayerIds.has(rule.playerId) || !validPlayerIds.has(rule.counterpartId)) {
      continue;
    }
    parent.set(rule.playerId, rule.counterpartId);
  }

  const cycles = new Set<string>();
  for (const start of parent.keys()) {
    if (cycles.has(start)) continue;
    const { chain, cycle } = walkChain(start, parent);
    if (cycle) {
      for (const id of chain) cycles.add(id);
    }
  }
  return cycles;
}

/**
 * Resolve isolation rules into the (txns, residualBalances) pair.
 *
 * Key insight: chains can be processed terminal-first. If A → B → C, we want
 * A to fold into B first (B then carries A's net), then B folds into C. We
 * process leaves first by topological order on the parent graph.
 */
interface IsolationResolution {
  forcedTxns: SettlementTxn[];
  /** Players that survive into the open settlement pool. */
  remaining: EffectiveBalance[];
  /** Players in cycles. */
  cyclePlayerIds: string[];
  /** Rules whose effects were applied (no cycles). */
  appliedIsolations: IsolationRule[];
}

function resolveIsolations(
  balances: EffectiveBalance[],
  rules: IsolationRule[]
): IsolationResolution {
  const validPlayerIds = new Set(balances.map((b) => b.playerId));
  const cycleIds = findCyclePlayerIds(rules, validPlayerIds);

  // Build child → parent map for the non-cyclic rules.
  const parent = new Map<string, string>();
  const applied: IsolationRule[] = [];
  for (const rule of rules) {
    if (!validPlayerIds.has(rule.playerId)) continue;
    if (!validPlayerIds.has(rule.counterpartId)) continue;
    if (cycleIds.has(rule.playerId)) continue;
    if (rule.playerId === rule.counterpartId) continue; // Defensive — already in cycleIds
    parent.set(rule.playerId, rule.counterpartId);
    applied.push(rule);
  }

  // Mutable working balances.
  const balanceMap = new Map<string, EffectiveBalance>(
    balances.map((b) => [b.playerId, { ...b }])
  );

  // Topological order: leaves (no children pointing at them) first.
  const childrenOf = new Map<string, string[]>();
  for (const [child, par] of parent) {
    if (!childrenOf.has(par)) childrenOf.set(par, []);
    childrenOf.get(par)!.push(child);
  }

  // Players-with-no-children (true leaves of the isolation tree) are processed
  // first. We do BFS from leaves up the chain.
  const inDegree = new Map<string, number>();
  for (const id of validPlayerIds) inDegree.set(id, 0);
  for (const [par, kids] of childrenOf) {
    inDegree.set(par, kids.length);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0 && parent.has(id)) queue.push(id);
  }
  // Determinism: sort once.
  queue.sort();

  const forcedTxns: SettlementTxn[] = [];
  const removed = new Set<string>();

  while (queue.length > 0) {
    const childId = queue.shift()!;
    const parentId = parent.get(childId)!;
    const child = balanceMap.get(childId)!;
    const par = balanceMap.get(parentId)!;

    // Settle child entirely with parent. The forced txn direction depends on
    // the sign of child.net.
    if (child.effectiveNetCents !== 0) {
      if (child.effectiveNetCents < 0) {
        // Child owes; child pays parent.
        forcedTxns.push({
          fromId: child.playerId,
          toId: par.playerId,
          amountCents: -child.effectiveNetCents,
          forced: true,
        });
      } else {
        // Child won; parent pays child.
        forcedTxns.push({
          fromId: par.playerId,
          toId: child.playerId,
          amountCents: child.effectiveNetCents,
          forced: true,
        });
      }
    }

    // Fold child's net into parent. Child no longer owes / is owed anything
    // in the open pool; parent now carries the combined obligation.
    par.effectiveNetCents += child.effectiveNetCents;
    child.effectiveNetCents = 0;
    removed.add(childId);

    // Parent may now be a leaf if all its children have been processed.
    const parentRemainingChildren =
      (inDegree.get(parentId) ?? 0) - 1;
    inDegree.set(parentId, parentRemainingChildren);
    if (parentRemainingChildren === 0 && parent.has(parentId)) {
      queue.push(parentId);
      // Re-sort to keep determinism if multiple appear at once.
      queue.sort();
    }
  }

  const remaining: EffectiveBalance[] = [];
  for (const [id, balance] of balanceMap) {
    if (removed.has(id)) continue;
    if (cycleIds.has(id)) continue;
    remaining.push(balance);
  }

  return {
    forcedTxns,
    remaining,
    cyclePlayerIds: Array.from(cycleIds).sort(),
    appliedIsolations: applied,
  };
}

/**
 * Maximum table size (after isolation collapse) for which we run the
 * provably-optimal subset-sum partition. 2^15 = 32k masks; the inner
 * subset-enumeration is bounded by the same so worst-case work is O(3^15)
 * ≈ 14M ops — well under 100 ms in JS. Above this we fall back to greedy.
 */
export const OPTIMAL_PARTITION_LIMIT = 15;

/**
 * Result of attempting an optimal partition. `partition` is a list of
 * disjoint sub-arrays of `EffectiveBalance` whose nets each sum to zero.
 * `kind` reports which algorithm settled the residual pool.
 */
interface OptimalPartitionResult {
  partition: EffectiveBalance[][];
  kind: 'optimal' | 'greedy-fallback';
}

/**
 * Optimal min-transactions partitioning via bitmask DP.
 *
 * Restated: minimum number of transactions to clear a set of N players
 * with zero-sum balances equals N − k, where k is the maximum number of
 * disjoint non-empty zero-sum subsets the players can be partitioned
 * into. Each k-player zero-sum subset is in turn settleable in k − 1
 * transactions (e.g. via greedy internally — order doesn't matter inside
 * a zero-sum subset).
 *
 * DP:
 *   f[mask] = max disjoint zero-sum subsets within `mask`,
 *             or −∞ if `mask` cannot be partitioned (sum ≠ 0).
 *   f[0]    = 0
 *   For each mask with sum=0, anchor on its lowest bit `i` (forces a
 *   canonical traversal order), and for each subset S of `mask` that
 *   contains `i` and has sum 0:
 *       f[mask] = max(f[mask], f[mask \ S] + 1).
 *
 * Determinism: input `balances` are sorted by `playerId` before bit
 * assignment, so the same logical pool always maps to the same bit
 * indices.
 *
 * Returns `{partition, kind: 'optimal'}` when the pool was zero-sum and
 * within the size limit; otherwise the greedy fallback wraps the whole
 * pool as one subset and returns `{partition: [pool], kind: 'greedy-fallback'}`.
 */
function partitionOptimally(balances: EffectiveBalance[]): OptimalPartitionResult {
  // Drop zero-net players from the partitioning — they're already settled.
  // They contribute trivially as size-1 zero-sum subsets (no transactions).
  const zeroNet = balances.filter((b) => b.effectiveNetCents === 0);
  const nonZero = balances.filter((b) => b.effectiveNetCents !== 0);

  if (nonZero.length === 0) {
    return {
      partition: zeroNet.map((b) => [b]),
      kind: 'optimal',
    };
  }
  if (nonZero.length > OPTIMAL_PARTITION_LIMIT) {
    return {
      partition: [balances],
      kind: 'greedy-fallback',
    };
  }

  // Total of the pool — required to be zero for partitioning to work.
  // (Imbalanced pools fall through to greedy which still produces a
  // sensible best-effort plan.)
  const total = nonZero.reduce((acc, b) => acc + b.effectiveNetCents, 0);
  if (total !== 0) {
    return { partition: [balances], kind: 'greedy-fallback' };
  }

  // Sort by playerId for determinism — bit i corresponds to the i-th id
  // in lexicographic order.
  const sorted = nonZero
    .slice()
    .sort((a, b) => a.playerId.localeCompare(b.playerId));
  const N = sorted.length;
  const FULL = (1 << N) - 1;
  const nets = sorted.map((b) => b.effectiveNetCents);

  // sumOf[mask] = sum of nets for the bits set in mask. Computed
  // incrementally: drop the lowest bit, look up the rest, add the
  // dropped player's net.
  const sumOf = new Array<number>(1 << N).fill(0);
  for (let mask = 1; mask <= FULL; mask++) {
    const low = mask & -mask;
    const i = 31 - Math.clz32(low);
    sumOf[mask] = sumOf[mask ^ low]! + nets[i]!;
  }

  // f[mask]    = max disjoint zero-sum subsets in `mask`, or -1.
  // choice[mask] = the subset S we picked first (anchor-containing) that
  //                achieved f[mask]. 0 means uninitialized.
  const f = new Int32Array(1 << N);
  f.fill(-1);
  f[0] = 0;
  const choice = new Int32Array(1 << N);

  for (let mask = 1; mask <= FULL; mask++) {
    if (sumOf[mask] !== 0) continue;
    const lowBit = mask & -mask;
    const baseMask = mask ^ lowBit;

    // Enumerate every subset of baseMask. For each one, prepend lowBit
    // to form S — the candidate anchor-containing subset of `mask`.
    // Standard trick: `sub = (sub - 1) & baseMask` walks all subsets
    // of `baseMask` (in descending order, including 0).
    let sub = baseMask;
    while (true) {
      const S = sub | lowBit;
      if (sumOf[S] === 0) {
        const rest = mask ^ S;
        const fRest = f[rest]!;
        if (fRest >= 0 && fRest + 1 > f[mask]!) {
          f[mask] = fRest + 1;
          choice[mask] = S;
        }
      }
      if (sub === 0) break;
      sub = (sub - 1) & baseMask;
    }
  }

  if (f[FULL]! <= 0) {
    // Shouldn't happen — total=0 guarantees the trivial partition (whole
    // set as one subset) gives f=1. Defensive fallback.
    return { partition: [balances], kind: 'greedy-fallback' };
  }

  // Reconstruct partition by walking choice[].
  const subsetMasks: number[] = [];
  let cursor = FULL;
  while (cursor !== 0) {
    const S = choice[cursor]!;
    if (S === 0) {
      // Should be unreachable when f[cursor] > 0; bail.
      return { partition: [balances], kind: 'greedy-fallback' };
    }
    subsetMasks.push(S);
    cursor ^= S;
  }
  // Sort subsets for determinism (smallest mask first → naturally
  // groups by smallest playerId in each subset).
  subsetMasks.sort((a, b) => a - b);

  const partition: EffectiveBalance[][] = subsetMasks.map((S) => {
    const out: EffectiveBalance[] = [];
    let m = S;
    while (m !== 0) {
      const low = m & -m;
      const i = 31 - Math.clz32(low);
      out.push(sorted[i]!);
      m ^= low;
    }
    return out;
  });

  // Each zero-net player joins the partition as a size-1 trivial subset
  // (no transactions) — keeps the count of "subsets" honest for the UI.
  for (const b of zeroNet) partition.push([b]);

  return { partition, kind: 'optimal' };
}

/**
 * Greedy max-creditor↔max-debtor settlement. Operates on a flat pool — all
 * isolation has already been resolved upstream.
 */
function greedySettle(balances: EffectiveBalance[]): SettlementTxn[] {
  const debtors: { playerId: string; amount: number }[] = [];
  const creditors: { playerId: string; amount: number }[] = [];

  for (const b of balances) {
    if (b.effectiveNetCents < 0) {
      debtors.push({ playerId: b.playerId, amount: -b.effectiveNetCents });
    } else if (b.effectiveNetCents > 0) {
      creditors.push({ playerId: b.playerId, amount: b.effectiveNetCents });
    }
  }

  const txns: SettlementTxn[] = [];

  while (debtors.length > 0 && creditors.length > 0) {
    debtors.sort((a, b) => b.amount - a.amount || a.playerId.localeCompare(b.playerId));
    creditors.sort((a, b) => b.amount - a.amount || a.playerId.localeCompare(b.playerId));

    const debtor = debtors[0]!;
    const creditor = creditors[0]!;
    const transfer = Math.min(debtor.amount, creditor.amount);

    txns.push({
      fromId: debtor.playerId,
      toId: creditor.playerId,
      amountCents: transfer,
    });

    debtor.amount -= transfer;
    creditor.amount -= transfer;

    if (debtor.amount === 0) debtors.shift();
    if (creditor.amount === 0) creditors.shift();
  }

  return txns;
}

/**
 * End-to-end: apply adjustments → resolve isolation → optimal-or-greedy
 * settle the residual pool.
 *
 * For pools of ≤ {@link OPTIMAL_PARTITION_LIMIT} non-zero-net players
 * with sum-to-zero, the residual is partitioned into the maximum number
 * of disjoint zero-sum subsets via bitmask DP, and each subset is
 * greedy-settled internally. The result is provably minimum-transactions.
 *
 * For larger pools (or imbalanced pools), we fall back to running
 * greedy on the entire residual.
 */
export function buildSettlementPlan(
  balances: EffectiveBalance[],
  isolations: IsolationRule[]
): SettlementPlan {
  const resolution = resolveIsolations(balances, isolations);

  // Optimal partition (or greedy fallback) of the residual pool.
  const partitionResult = partitionOptimally(resolution.remaining);
  const residualTxns: SettlementTxn[] = [];
  for (const subset of partitionResult.partition) {
    // Each subset is zero-sum (when `kind === 'optimal'`); within a
    // zero-sum subset of size k, any settlement order produces k − 1
    // transactions, so greedy is fine here.
    for (const t of greedySettle(subset)) residualTxns.push(t);
  }

  const allTxns = [...resolution.forcedTxns, ...residualTxns];

  // Residue = sum across players still in cycles + the open-pool residue
  // (which should be zero for a balanced ledger).
  let cycleResidue = 0;
  const cycleSet = new Set(resolution.cyclePlayerIds);
  for (const b of balances) {
    if (cycleSet.has(b.playerId)) {
      cycleResidue += b.effectiveNetCents;
    }
  }
  // Open-pool residue: greedy preserves the sum, so this is just the
  // pool's running total.
  let openPoolResidue = 0;
  for (const b of resolution.remaining) {
    openPoolResidue += b.effectiveNetCents;
  }
  const residueCents = Math.abs(cycleResidue) + Math.abs(openPoolResidue);

  // Subset count: trivial for greedy (the entire pool is one subset);
  // for optimal it's the partition count we landed on.
  const subsetCount =
    partitionResult.kind === 'optimal' ? partitionResult.partition.length : 1;

  // Map partition kind → public algorithm tag.
  const algorithm: SettlementPlan['algorithm'] =
    partitionResult.kind === 'optimal'
      ? 'optimal'
      : resolution.remaining.length > OPTIMAL_PARTITION_LIMIT
        ? 'greedy-fallback'
        : 'greedy';

  return {
    txns: allTxns,
    isFullyBalanced: residueCents === 0 && resolution.cyclePlayerIds.length === 0,
    residueCents,
    cyclePlayerIds: resolution.cyclePlayerIds,
    appliedIsolations: resolution.appliedIsolations,
    algorithm,
    subsetCount,
  };
}

/**
 * End-to-end pipeline used by both the ephemeral and persistent views.
 *
 * Optional `aliases` collapse the player roster first: each `playerId →
 * aliasToPlayerId` rule folds the source player's net into the target
 * and rewrites adjustments + isolation rules to use canonical ids. This
 * matches the server's `rederivePlan` so both modes settle identically.
 */
export function computePlan(
  rows: LedgerRow[],
  adjustments: Adjustment[],
  isolations: IsolationRule[],
  aliases: ReadonlyArray<AliasRule> = []
): { balances: EffectiveBalance[]; plan: SettlementPlan } {
  if (aliases.length === 0) {
    const balances = applyAdjustments(rows, adjustments);
    const plan = buildSettlementPlan(balances, isolations);
    return { balances, plan };
  }
  const canonical = buildCanonicalMap(aliases);
  const collapsedRows = collapseRows(rows, canonical);
  const collapsedAdjustments = collapseAdjustments(adjustments, canonical);
  const { rules: collapsedIsolations } = collapseIsolations(isolations, canonical);
  const balances = applyAdjustments(collapsedRows, collapsedAdjustments);
  const plan = buildSettlementPlan(balances, collapsedIsolations);
  return { balances, plan };
}
