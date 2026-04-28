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
 * End-to-end: apply adjustments → resolve isolation → greedy settle.
 */
export function buildSettlementPlan(
  balances: EffectiveBalance[],
  isolations: IsolationRule[]
): SettlementPlan {
  const resolution = resolveIsolations(balances, isolations);
  const greedyTxns = greedySettle(resolution.remaining);
  const allTxns = [...resolution.forcedTxns, ...greedyTxns];

  // Residue = sum across players still in cycles + the open-pool residue
  // (which should be zero for a balanced ledger).
  let residueCents = 0;
  const cycleSet = new Set(resolution.cyclePlayerIds);
  for (const b of balances) {
    if (cycleSet.has(b.playerId)) {
      residueCents += b.effectiveNetCents;
    }
  }
  // Open-pool residue (after greedy) = sum of remaining balances minus what
  // the greedy moved. Greedy preserves the sum, so this collapses to the
  // pool's total.
  let openPoolResidue = 0;
  for (const b of resolution.remaining) {
    openPoolResidue += b.effectiveNetCents;
  }
  residueCents = Math.abs(residueCents) + Math.abs(openPoolResidue);

  return {
    txns: allTxns,
    isFullyBalanced: residueCents === 0 && resolution.cyclePlayerIds.length === 0,
    residueCents,
    cyclePlayerIds: resolution.cyclePlayerIds,
    appliedIsolations: resolution.appliedIsolations,
  };
}

export function computePlan(
  rows: LedgerRow[],
  adjustments: Adjustment[],
  isolations: IsolationRule[]
): { balances: EffectiveBalance[]; plan: SettlementPlan } {
  const balances = applyAdjustments(rows, adjustments);
  const plan = buildSettlementPlan(balances, isolations);
  return { balances, plan };
}
