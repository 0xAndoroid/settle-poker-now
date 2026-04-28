/**
 * Min-transactions debt simplification.
 *
 * Algorithm: greedy max-creditor-meets-max-debtor. Repeatedly match the
 * largest positive balance against the largest negative balance, settle the
 * smaller of the two in absolute terms, and remove the cleared player from
 * the pool. Produces at most N-1 transactions for N participants — strictly
 * fewer when nets happen to align.
 *
 * NOTE: minimum-transactions debt simplification is NP-hard in the general
 * case (subset-sum reduction), so this is the standard greedy approximation.
 * In practice the heuristic produces optimal or near-optimal plans for poker
 * tables (≤ 10 players), and it is fully deterministic.
 *
 * All arithmetic is performed on integer cents. Ties broken by playerId
 * lexicographic ordering so identical inputs produce identical outputs.
 */

import type {
  Adjustment,
  EffectiveBalance,
  Group,
  GroupSettlement,
  LedgerRow,
  SettlementPlan,
  SettlementTxn,
} from './types';

const EPSILON_CENTS = 0; // We work in integer cents; no epsilon needed.

/**
 * Apply user-recorded adjustments to the original ledger nets.
 *
 * Each adjustment `from → to: $X` represents a payment that already occurred
 * outside the app. Effect on balances:
 *   - `from`'s effective net increases by X (they owe less / are owed more).
 *   - `to`'s effective net decreases by X (they are owed less / owe more).
 *
 * Sanity: this preserves the total-balance-equals-zero invariant because
 * every adjustment is symmetric (+X to one player, -X to another).
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
    // Adjustments referencing missing players are silently ignored — the UI
    // layer is responsible for keeping the adjustment list consistent with
    // the ledger.
    if (!from || !to) continue;
    from.effectiveNetCents += adj.amountCents;
    to.effectiveNetCents -= adj.amountCents;
  }

  return Array.from(byId.values());
}

/**
 * Settle a single group of players using the greedy heuristic.
 * Returns transactions and an `isImbalanced` flag if the group's nets do not
 * sum to zero.
 */
export function settleGroup(balances: EffectiveBalance[], groupId: string): GroupSettlement {
  const imbalanceCents = balances.reduce((acc, b) => acc + b.effectiveNetCents, 0);
  const isImbalanced = Math.abs(imbalanceCents) > EPSILON_CENTS;

  // Working copies — we'll mutate amounts as we settle.
  const debtors: { playerId: string; amount: number }[] = [];
  const creditors: { playerId: string; amount: number }[] = [];

  for (const b of balances) {
    if (b.effectiveNetCents < 0) {
      debtors.push({ playerId: b.playerId, amount: -b.effectiveNetCents });
    } else if (b.effectiveNetCents > 0) {
      creditors.push({ playerId: b.playerId, amount: b.effectiveNetCents });
    }
  }

  // Determinism: sort once by amount desc, then by playerId asc as tiebreaker.
  // Re-sorting on every iteration would also be deterministic but is O(N²log N).
  // Since amounts only decrease monotonically and the largest is always at
  // index 0 after each pass, we re-sort each pass for correctness.
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

  return {
    groupId,
    isImbalanced,
    imbalanceCents,
    txns,
  };
}

/**
 * Build the full settlement plan: partition by groups, run the greedy algo
 * inside each group independently, and merge results.
 *
 * If `groups` is empty, defaults to a single group containing everyone.
 */
export function buildSettlementPlan(
  balances: EffectiveBalance[],
  groups: Group[]
): SettlementPlan {
  const effectiveGroups: Group[] =
    groups.length > 0 ? groups : [{ id: 'all', memberIds: balances.map((b) => b.playerId) }];

  const balanceById = new Map(balances.map((b) => [b.playerId, b]));
  const groupResults: GroupSettlement[] = [];

  for (const group of effectiveGroups) {
    const groupBalances: EffectiveBalance[] = [];
    for (const memberId of group.memberIds) {
      const b = balanceById.get(memberId);
      if (b) groupBalances.push(b);
    }
    if (groupBalances.length === 0) {
      groupResults.push({
        groupId: group.id,
        isImbalanced: false,
        imbalanceCents: 0,
        txns: [],
      });
      continue;
    }
    groupResults.push(settleGroup(groupBalances, group.id));
  }

  const allTxns: SettlementTxn[] = [];
  let totalImbalance = 0;
  let isFullyBalanced = true;
  for (const result of groupResults) {
    allTxns.push(...result.txns);
    totalImbalance += Math.abs(result.imbalanceCents);
    if (result.isImbalanced) isFullyBalanced = false;
  }

  return {
    groups: groupResults,
    txns: allTxns,
    isFullyBalanced,
    totalImbalanceCents: totalImbalance,
  };
}

/**
 * Convenience: full pipeline from ledger → adjustments → groups → plan.
 */
export function computePlan(
  rows: LedgerRow[],
  adjustments: Adjustment[],
  groups: Group[]
): { balances: EffectiveBalance[]; plan: SettlementPlan } {
  const balances = applyAdjustments(rows, adjustments);
  const plan = buildSettlementPlan(balances, groups);
  return { balances, plan };
}
