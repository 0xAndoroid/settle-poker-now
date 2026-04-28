import { describe, expect, it } from 'vitest';
import {
  applyAdjustments,
  buildSettlementPlan,
  computePlan,
  settleGroup,
} from './settle';
import type { Adjustment, EffectiveBalance, Group, LedgerRow, SettlementTxn } from './types';

const row = (playerId: string, nickname: string, netCents: number): LedgerRow => ({
  playerId,
  nickname,
  netCents,
  buyInCents: 0,
  buyOutCents: 0,
});

const balance = (playerId: string, nickname: string, netCents: number): EffectiveBalance => ({
  playerId,
  nickname,
  originalNetCents: netCents,
  effectiveNetCents: netCents,
});

/**
 * Sanity check: after applying all txns, each player's net cash flow should
 * equal their effectiveNetCents. Debtors (negative net) pay out, creditors
 * (positive net) receive money.
 */
function expectBalanced(txns: SettlementTxn[], balances: EffectiveBalance[]) {
  const delta = new Map<string, number>(balances.map((b) => [b.playerId, 0]));
  for (const t of txns) {
    // `from` sends amount out → delta decreases.
    delta.set(t.fromId, (delta.get(t.fromId) ?? 0) - t.amountCents);
    // `to` receives amount → delta increases.
    delta.set(t.toId, (delta.get(t.toId) ?? 0) + t.amountCents);
  }
  for (const b of balances) {
    expect(delta.get(b.playerId), `player ${b.playerId} cashflow mismatch`).toBe(
      b.effectiveNetCents
    );
  }
}

describe('settleGroup', () => {
  it('returns no transactions for an empty pool', () => {
    const result = settleGroup([], 'g');
    expect(result.txns).toEqual([]);
    expect(result.isImbalanced).toBe(false);
    expect(result.imbalanceCents).toBe(0);
  });

  it('returns no transactions when all nets are zero', () => {
    const balances = [balance('p1', 'A', 0), balance('p2', 'B', 0), balance('p3', 'C', 0)];
    const result = settleGroup(balances, 'g');
    expect(result.txns).toEqual([]);
    expect(result.isImbalanced).toBe(false);
  });

  it('settles a two-player game in one transaction', () => {
    const balances = [balance('alice', 'Alice', -5000), balance('bob', 'Bob', 5000)];
    const result = settleGroup(balances, 'g');
    expect(result.txns).toEqual([{ fromId: 'alice', toId: 'bob', amountCents: 5000 }]);
    expect(result.isImbalanced).toBe(false);
    expectBalanced(result.txns, balances);
  });

  it('settles a three-way game with one big winner in fewer than N-1', () => {
    // -300, -200, +500 → debtors both pay the single creditor: 2 txns
    const balances = [
      balance('a', 'A', -30000),
      balance('b', 'B', -20000),
      balance('c', 'C', 50000),
    ];
    const result = settleGroup(balances, 'g');
    expect(result.txns).toHaveLength(2);
    expectBalanced(result.txns, balances);
  });

  it('breaks ties deterministically by player_id', () => {
    // Two debtors and two creditors, all $300. Determinism check: regardless of
    // input order, the largest creditor (alphabetically first id when tied)
    // should always be matched against the largest debtor (alphabetically first
    // id when tied).
    const balancesAsc = [
      balance('alice', 'Alice', -30000),
      balance('bob', 'Bob', -30000),
      balance('carol', 'Carol', 30000),
      balance('dave', 'Dave', 30000),
    ];
    const balancesDesc = [...balancesAsc].reverse();

    const a = settleGroup(balancesAsc, 'g');
    const b = settleGroup(balancesDesc, 'g');

    expect(a.txns).toEqual(b.txns);
    expect(a.txns).toEqual([
      { fromId: 'alice', toId: 'carol', amountCents: 30000 },
      { fromId: 'bob', toId: 'dave', amountCents: 30000 },
    ]);
  });

  it('uses integer cents — never produces fractional amounts', () => {
    // Specifically chosen to expose float drift if anyone refactors away from
    // integer math: $1.10 + $1.10 + $1.10 = $3.30 (not 3.3000000004).
    const balances = [
      balance('a', 'A', -110),
      balance('b', 'B', -110),
      balance('c', 'C', -110),
      balance('d', 'D', 330),
    ];
    const result = settleGroup(balances, 'g');
    for (const t of result.txns) {
      expect(Number.isInteger(t.amountCents)).toBe(true);
    }
    expectBalanced(result.txns, balances);
  });

  it('flags an imbalanced group without crashing', () => {
    const balances = [balance('a', 'A', -10000), balance('b', 'B', 5000)];
    const result = settleGroup(balances, 'g');
    expect(result.isImbalanced).toBe(true);
    expect(result.imbalanceCents).toBe(-5000);
    // Greedy still runs as far as it can: $50 settled, $50 of debtor balance unmatched.
    expect(result.txns).toEqual([{ fromId: 'a', toId: 'b', amountCents: 5000 }]);
  });
});

describe('applyAdjustments', () => {
  it('credits the payer and debits the receiver', () => {
    const rows = [row('a', 'A', -10000), row('b', 'B', 10000)];
    const adjustments: Adjustment[] = [
      { id: 'x', fromId: 'a', toId: 'b', amountCents: 4000 },
    ];
    const result = applyAdjustments(rows, adjustments);
    const a = result.find((r) => r.playerId === 'a')!;
    const b = result.find((r) => r.playerId === 'b')!;
    // a paid $40 already → effective net = -100 + 40 = -60
    expect(a.effectiveNetCents).toBe(-6000);
    // b received $40 already → effective net = 100 - 40 = 60
    expect(b.effectiveNetCents).toBe(6000);
    // Total still sums to zero.
    expect(a.effectiveNetCents + b.effectiveNetCents).toBe(0);
  });

  it('ignores adjustments that reference unknown players', () => {
    const rows = [row('a', 'A', -10000), row('b', 'B', 10000)];
    const adjustments: Adjustment[] = [
      { id: 'x', fromId: 'ghost', toId: 'b', amountCents: 9999 },
    ];
    const result = applyAdjustments(rows, adjustments);
    expect(result.find((r) => r.playerId === 'a')!.effectiveNetCents).toBe(-10000);
    expect(result.find((r) => r.playerId === 'b')!.effectiveNetCents).toBe(10000);
  });
});

describe('buildSettlementPlan', () => {
  it('respects group isolation (the user-specified discontinuity case)', () => {
    // Andrew owes $500, Kevin won $400 → group A net = -$100 (imbalanced!)
    // Kedar owes $300, Pranav won $400 → group B net = +$100 (imbalanced!)
    // Total nets to zero, but groups individually do not.
    // The algo must NOT settle Andrew↔Pranav across groups.
    const balances: EffectiveBalance[] = [
      balance('andrew', 'Andrew', -50000),
      balance('kevin', 'Kevin', 40000),
      balance('kedar', 'Kedar', -30000),
      balance('pranav', 'Pranav', 40000),
    ];
    const groups: Group[] = [
      { id: 'A', memberIds: ['andrew', 'kevin'] },
      { id: 'B', memberIds: ['kedar', 'pranav'] },
    ];

    const plan = buildSettlementPlan(balances, groups);

    // No txn should cross group boundaries.
    const groupA = new Set(['andrew', 'kevin']);
    const groupB = new Set(['kedar', 'pranav']);
    for (const t of plan.txns) {
      const sameGroup =
        (groupA.has(t.fromId) && groupA.has(t.toId)) ||
        (groupB.has(t.fromId) && groupB.has(t.toId));
      expect(sameGroup, `txn ${t.fromId} → ${t.toId} crosses groups!`).toBe(true);
    }
    // Both groups should be flagged imbalanced.
    expect(plan.groups.find((g) => g.groupId === 'A')!.isImbalanced).toBe(true);
    expect(plan.groups.find((g) => g.groupId === 'B')!.isImbalanced).toBe(true);
    expect(plan.isFullyBalanced).toBe(false);
  });

  it('settles within balanced groups independently and minimally', () => {
    // Group A: -200 / +200 → 1 txn
    // Group B: -100 / -300 / +400 → 2 txns
    const balances: EffectiveBalance[] = [
      balance('a1', 'A1', -20000),
      balance('a2', 'A2', 20000),
      balance('b1', 'B1', -10000),
      balance('b2', 'B2', -30000),
      balance('b3', 'B3', 40000),
    ];
    const groups: Group[] = [
      { id: 'A', memberIds: ['a1', 'a2'] },
      { id: 'B', memberIds: ['b1', 'b2', 'b3'] },
    ];

    const plan = buildSettlementPlan(balances, groups);
    expect(plan.isFullyBalanced).toBe(true);
    expect(plan.txns).toHaveLength(3);
    expectBalanced(
      plan.txns,
      balances // every player still settles to their effective net
    );
  });

  it('falls back to a single all-players group when no groups are provided', () => {
    const balances: EffectiveBalance[] = [
      balance('a', 'A', -50000),
      balance('b', 'B', 50000),
    ];
    const plan = buildSettlementPlan(balances, []);
    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0]!.groupId).toBe('all');
    expect(plan.txns).toHaveLength(1);
  });
});

describe('computePlan (end-to-end)', () => {
  it('mixed: real ledger + adjustments + groups produces a consistent plan', () => {
    const rows: LedgerRow[] = [
      row('andrew', 'Andrew', -50000),
      row('kevin', 'Kevin', 40000),
      row('kedar', 'Kedar', -30000),
      row('pranav', 'Pranav', 40000),
    ];
    // Andrew already paid Kevin $200 in cash.
    const adjustments: Adjustment[] = [
      { id: 'x1', fromId: 'andrew', toId: 'kevin', amountCents: 20000 },
    ];
    // After adjustments (sum stays zero — adjustments are symmetric):
    //   Andrew: -500 + 200 = -300
    //   Kevin:  +400 - 200 = +200
    //   Kedar:  -300
    //   Pranav: +400
    const { balances, plan } = computePlan(rows, adjustments, []);
    expect(balances.find((b) => b.playerId === 'andrew')!.effectiveNetCents).toBe(-30000);
    expect(balances.find((b) => b.playerId === 'kevin')!.effectiveNetCents).toBe(20000);
    // Sum still zero → the global settlement is balanced.
    expect(plan.isFullyBalanced).toBe(true);
    expect(plan.totalImbalanceCents).toBe(0);
    // Two debtors total $600, two creditors total $600 → 3 txns max (2 debtors + 2 creditors - 1).
    expect(plan.txns.length).toBeLessThanOrEqual(3);
    expectBalanced(plan.txns, balances);
  });

  it('settles a $0 game with no transactions', () => {
    const rows: LedgerRow[] = [
      row('a', 'A', 0),
      row('b', 'B', 0),
    ];
    const { plan } = computePlan(rows, [], []);
    expect(plan.txns).toEqual([]);
    expect(plan.isFullyBalanced).toBe(true);
  });
});
