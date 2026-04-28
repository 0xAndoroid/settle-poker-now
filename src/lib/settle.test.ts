import { describe, expect, it } from 'vitest';
import { applyAdjustments, buildSettlementPlan, computePlan } from './settle';
import type {
  Adjustment,
  EffectiveBalance,
  IsolationRule,
  LedgerRow,
  SettlementTxn,
} from './types';

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
    delta.set(t.fromId, (delta.get(t.fromId) ?? 0) - t.amountCents);
    delta.set(t.toId, (delta.get(t.toId) ?? 0) + t.amountCents);
  }
  for (const b of balances) {
    expect(delta.get(b.playerId), `player ${b.playerId} cashflow mismatch`).toBe(
      b.effectiveNetCents
    );
  }
}

describe('buildSettlementPlan — no isolation rules', () => {
  it('greedy settles a 4-player game', () => {
    const balances = [
      balance('andrew', 'Andrew', -50000),
      balance('kevin', 'Kevin', 40000),
      balance('kedar', 'Kedar', -30000),
      balance('pranav', 'Pranav', 40000),
    ];
    const plan = buildSettlementPlan(balances, []);
    expect(plan.isFullyBalanced).toBe(true);
    expect(plan.txns.length).toBeLessThanOrEqual(3);
    expectBalanced(plan.txns, balances);
  });

  it('returns no transactions for an all-zero pool', () => {
    const balances = [balance('a', 'A', 0), balance('b', 'B', 0)];
    const plan = buildSettlementPlan(balances, []);
    expect(plan.txns).toEqual([]);
    expect(plan.isFullyBalanced).toBe(true);
  });

  it('breaks ties deterministically by playerId', () => {
    const ascending = [
      balance('alice', 'Alice', -30000),
      balance('bob', 'Bob', -30000),
      balance('carol', 'Carol', 30000),
      balance('dave', 'Dave', 30000),
    ];
    const descending = [...ascending].reverse();
    expect(buildSettlementPlan(ascending, []).txns).toEqual(
      buildSettlementPlan(descending, []).txns
    );
  });
});

describe('buildSettlementPlan — single isolation rule', () => {
  it('isolates one player to a hub: forced txn + folded net', () => {
    // Andrew (-$500) is isolated to Kevin. Kedar (-$300), Pranav (+$400) free.
    // Sum: Andrew -500 + Kevin +400 + Kedar -300 + Pranav +400 = 0.
    const balances = [
      balance('andrew', 'Andrew', -50000),
      balance('kevin', 'Kevin', 40000),
      balance('kedar', 'Kedar', -30000),
      balance('pranav', 'Pranav', 40000),
    ];
    const isolations: IsolationRule[] = [
      { playerId: 'andrew', counterpartId: 'kevin' },
    ];
    const plan = buildSettlementPlan(balances, isolations);

    // Andrew must pay Kevin $500 (forced); after that Kevin's effective net
    // becomes 400 + (-500) = -100. Pool now: Kevin -100, Kedar -300, Pranav +400.
    // Greedy settles: Kedar → Pranav $300, Kevin → Pranav $100.
    const forced = plan.txns.filter((t) => t.forced);
    expect(forced).toEqual([
      { fromId: 'andrew', toId: 'kevin', amountCents: 50000, forced: true },
    ]);

    // Andrew should not appear in any non-forced txn.
    const openTxns = plan.txns.filter((t) => !t.forced);
    for (const t of openTxns) {
      expect(t.fromId).not.toBe('andrew');
      expect(t.toId).not.toBe('andrew');
    }

    expect(plan.isFullyBalanced).toBe(true);
    expect(plan.cyclePlayerIds).toEqual([]);
    expectBalanced(plan.txns, balances);
  });

  it('isolated player who WON pays the counterpart', () => {
    // Andrew won $200, isolated to Kevin (who lost $200).
    const balances = [
      balance('andrew', 'Andrew', 20000),
      balance('kevin', 'Kevin', -20000),
    ];
    const isolations: IsolationRule[] = [
      { playerId: 'andrew', counterpartId: 'kevin' },
    ];
    const plan = buildSettlementPlan(balances, isolations);

    // Andrew won, so Kevin pays Andrew $200.
    expect(plan.txns).toEqual([
      { fromId: 'kevin', toId: 'andrew', amountCents: 20000, forced: true },
    ]);
    expect(plan.isFullyBalanced).toBe(true);
  });
});

describe('buildSettlementPlan — multiple isolated to same hub', () => {
  it('two losers isolated to one winner: two forced txns, hub absorbs both', () => {
    // Andrew (-200) and Sam (-150) both isolated to Kevin (+450).
    // Kedar (-100), Pranav (0) round out the table.
    // Total: -200 - 150 + 450 - 100 + 0 = 0.
    const balances = [
      balance('andrew', 'Andrew', -20000),
      balance('sam', 'Sam', -15000),
      balance('kevin', 'Kevin', 45000),
      balance('kedar', 'Kedar', -10000),
      balance('pranav', 'Pranav', 0),
    ];
    const isolations: IsolationRule[] = [
      { playerId: 'andrew', counterpartId: 'kevin' },
      { playerId: 'sam', counterpartId: 'kevin' },
    ];
    const plan = buildSettlementPlan(balances, isolations);

    const forced = plan.txns.filter((t) => t.forced);
    expect(forced).toContainEqual({
      fromId: 'andrew',
      toId: 'kevin',
      amountCents: 20000,
      forced: true,
    });
    expect(forced).toContainEqual({
      fromId: 'sam',
      toId: 'kevin',
      amountCents: 15000,
      forced: true,
    });

    // After folding: Kevin's effective = 450 - 200 - 150 = 100. Pool:
    // Kevin +100, Kedar -100, Pranav 0. Greedy → Kedar pays Kevin $100.
    const openTxns = plan.txns.filter((t) => !t.forced);
    expect(openTxns).toEqual([
      { fromId: 'kedar', toId: 'kevin', amountCents: 10000 },
    ]);

    expect(plan.isFullyBalanced).toBe(true);
    expectBalanced(plan.txns, balances);
  });
});

describe('buildSettlementPlan — transitive isolation chains', () => {
  it('A → B → C: A folds into B first, then B folds into C', () => {
    // Andrew (-100) → Kevin; Kevin (-50) → Charlie. Charlie won 150.
    // After A folds: Kevin = -50 + (-100) = -150. After B folds: Charlie = 150 + (-150) = 0.
    const balances = [
      balance('andrew', 'Andrew', -10000),
      balance('kevin', 'Kevin', -5000),
      balance('charlie', 'Charlie', 15000),
    ];
    const isolations: IsolationRule[] = [
      { playerId: 'andrew', counterpartId: 'kevin' },
      { playerId: 'kevin', counterpartId: 'charlie' },
    ];
    const plan = buildSettlementPlan(balances, isolations);

    // Expect 2 forced txns: andrew→kevin $100, then kevin→charlie $150.
    const forced = plan.txns.filter((t) => t.forced);
    expect(forced).toEqual([
      { fromId: 'andrew', toId: 'kevin', amountCents: 10000, forced: true },
      { fromId: 'kevin', toId: 'charlie', amountCents: 15000, forced: true },
    ]);

    expect(plan.isFullyBalanced).toBe(true);
    expectBalanced(plan.txns, balances);
  });
});

describe('buildSettlementPlan — cycle rejection', () => {
  it('rejects A → B, B → A (two-cycle) and surfaces both ids', () => {
    const balances = [
      balance('a', 'A', -5000),
      balance('b', 'B', 5000),
    ];
    const isolations: IsolationRule[] = [
      { playerId: 'a', counterpartId: 'b' },
      { playerId: 'b', counterpartId: 'a' },
    ];
    const plan = buildSettlementPlan(balances, isolations);

    expect(plan.cyclePlayerIds.sort()).toEqual(['a', 'b']);
    expect(plan.isFullyBalanced).toBe(false);
    // No txns should be emitted for cycle members.
    expect(plan.txns).toEqual([]);
    expect(plan.appliedIsolations).toEqual([]);
  });

  it('rejects a longer cycle A → B → C → A and isolates uninvolved players', () => {
    const balances = [
      balance('a', 'A', -3000),
      balance('b', 'B', -2000),
      balance('c', 'C', 5000),
      balance('d', 'D', -1000),
      balance('e', 'E', 1000),
    ];
    const isolations: IsolationRule[] = [
      { playerId: 'a', counterpartId: 'b' },
      { playerId: 'b', counterpartId: 'c' },
      { playerId: 'c', counterpartId: 'a' },
    ];
    const plan = buildSettlementPlan(balances, isolations);

    expect(plan.cyclePlayerIds.sort()).toEqual(['a', 'b', 'c']);
    // d and e should still settle normally between themselves.
    expect(plan.txns).toEqual([
      { fromId: 'd', toId: 'e', amountCents: 1000 },
    ]);
    // Cycle members aren't settled even though they collectively balance.
    expect(plan.isFullyBalanced).toBe(false);
    // Each cycle member retains a non-zero individual net.
    for (const id of plan.cyclePlayerIds) {
      const b = balances.find((x) => x.playerId === id)!;
      expect(b.effectiveNetCents).not.toBe(0);
    }
  });
});

describe('buildSettlementPlan — isolation + adjustments interaction', () => {
  it('adjustments rebalance nets BEFORE isolation resolves', () => {
    // Andrew lost $500. He already paid Kevin $200 in cash. He's isolated to Kevin.
    // After adjustments: Andrew = -500 + 200 = -300. Kevin = +400 - 200 = +200.
    // Andrew's forced txn to Kevin should be $300 (NOT $500).
    const rows = [
      row('andrew', 'Andrew', -50000),
      row('kevin', 'Kevin', 40000),
      row('pranav', 'Pranav', 10000),
    ];
    const adjustments: Adjustment[] = [
      { id: 'adj1', fromId: 'andrew', toId: 'kevin', amountCents: 20000 },
    ];
    const isolations: IsolationRule[] = [
      { playerId: 'andrew', counterpartId: 'kevin' },
    ];

    const { plan } = computePlan(rows, adjustments, isolations);

    const forced = plan.txns.filter((t) => t.forced);
    expect(forced).toEqual([
      { fromId: 'andrew', toId: 'kevin', amountCents: 30000, forced: true },
    ]);
    expect(plan.isFullyBalanced).toBe(true);
  });
});

describe('buildSettlementPlan — edge cases', () => {
  it('isolated player with zero net produces no forced txn', () => {
    // Andrew breaks even, isolated to Kevin.
    const balances = [
      balance('andrew', 'Andrew', 0),
      balance('kevin', 'Kevin', 5000),
      balance('sam', 'Sam', -5000),
    ];
    const isolations: IsolationRule[] = [
      { playerId: 'andrew', counterpartId: 'kevin' },
    ];
    const plan = buildSettlementPlan(balances, isolations);

    const forced = plan.txns.filter((t) => t.forced);
    expect(forced).toEqual([]);
    expect(plan.txns).toEqual([
      { fromId: 'sam', toId: 'kevin', amountCents: 5000 },
    ]);
    expect(plan.isFullyBalanced).toBe(true);
  });

  it('rule referencing missing player is silently ignored', () => {
    const balances = [
      balance('a', 'A', -5000),
      balance('b', 'B', 5000),
    ];
    const isolations: IsolationRule[] = [
      { playerId: 'ghost', counterpartId: 'b' },
      { playerId: 'a', counterpartId: 'phantom' },
    ];
    const plan = buildSettlementPlan(balances, isolations);
    expect(plan.appliedIsolations).toEqual([]);
    expect(plan.txns).toEqual([
      { fromId: 'a', toId: 'b', amountCents: 5000 },
    ]);
  });

  it('self-isolation is treated as a cycle', () => {
    const balances = [
      balance('a', 'A', -5000),
      balance('b', 'B', 5000),
    ];
    const isolations: IsolationRule[] = [
      { playerId: 'a', counterpartId: 'a' },
    ];
    const plan = buildSettlementPlan(balances, isolations);
    expect(plan.cyclePlayerIds).toContain('a');
  });
});

describe('applyAdjustments', () => {
  it('credits the payer and debits the receiver', () => {
    const rows = [row('a', 'A', -10000), row('b', 'B', 10000)];
    const result = applyAdjustments(rows, [
      { id: 'x', fromId: 'a', toId: 'b', amountCents: 4000 },
    ]);
    expect(result.find((r) => r.playerId === 'a')!.effectiveNetCents).toBe(-6000);
    expect(result.find((r) => r.playerId === 'b')!.effectiveNetCents).toBe(6000);
  });
});
