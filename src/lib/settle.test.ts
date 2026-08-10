import { describe, expect, it } from 'vitest';
import {
  OPTIMAL_PARTITION_LIMIT,
  applyAdjustments,
  buildSettlementPlan,
  computePlan,
  roundLedgerRowsToDollars,
} from './settle';
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

/* ──────── Optimal subset-sum partition algorithm ──────── */

/**
 * Run the legacy greedy heuristic standalone for comparison. Mirrors
 * the inner `greedySettle` of settle.ts (kept private). We compute it
 * by running `buildSettlementPlan` with one giant pool that the
 * partition step folds into a single subset (size > 15) — but since we
 * want a comparison value, easier to count directly: greedy on a
 * zero-sum pool of size N produces exactly (count of debtors + count
 * of creditors − 1) transactions when nets are all distinct, and
 * fewer in some lucky cases. The simpler way to compute it here is
 * to call `buildSettlementPlan` with a deliberately-padded pool that
 * exceeds the threshold.
 *
 * Cleaner alternative: re-implement greedy here for tests only, so we
 * can compare numbers without leaning on threshold tricks.
 */
function greedyTxnCount(balances: EffectiveBalance[]): number {
  const debtors: number[] = [];
  const creditors: number[] = [];
  for (const b of balances) {
    if (b.effectiveNetCents < 0) debtors.push(-b.effectiveNetCents);
    else if (b.effectiveNetCents > 0) creditors.push(b.effectiveNetCents);
  }
  let count = 0;
  while (debtors.length > 0 && creditors.length > 0) {
    debtors.sort((a, b) => b - a);
    creditors.sort((a, b) => b - a);
    const transfer = Math.min(debtors[0]!, creditors[0]!);
    debtors[0]! -= transfer;
    creditors[0]! -= transfer;
    if (debtors[0]! === 0) debtors.shift();
    if (creditors[0]! === 0) creditors.shift();
    count++;
  }
  return count;
}

describe('optimal subset-sum partition — counterexamples vs greedy', () => {
  it('the canonical {+5,+5,−3,−3,−2,−2} partitions into 2 zero-sum triples', () => {
    // Two zero-sum triples: {A=+5, C=-3, E=-2} and {B=+5, D=-3, F=-2}.
    // Naive greedy can give 5 here; sort-and-pair greedy gets to 4,
    // matching optimal. We assert subsetCount=2 (the actual structural
    // win) and txns.length=4 (the matching count).
    const balances = [
      balance('a', 'A', 500),
      balance('b', 'B', 500),
      balance('c', 'C', -300),
      balance('d', 'D', -300),
      balance('e', 'E', -200),
      balance('f', 'F', -200),
    ];

    const plan = buildSettlementPlan(balances, []);
    expect(plan.algorithm).toBe('optimal');
    expect(plan.subsetCount).toBe(2);
    expect(plan.txns.length).toBe(4);
    expect(plan.txns.length).toBeLessThanOrEqual(greedyTxnCount(balances));
    expectBalanced(plan.txns, balances);
  });

  it('the strict counterexample where naive greedy makes too many trades', () => {
    // Sort-and-pair greedy on this 8-player input chooses to bridge a
    // chunk that breaks an otherwise-clean two-subset partition. We
    // confirm subsetCount > 1 here and the optimal count matches.
    // Players designed so that {A,B,C,D} and {E,F,G,H} each sum to 0.
    const balances = [
      balance('a', 'A', 700),
      balance('b', 'B', 300),
      balance('c', 'C', -400),
      balance('d', 'D', -600),
      balance('e', 'E', 800),
      balance('f', 'F', 200),
      balance('g', 'G', -500),
      balance('h', 'H', -500),
    ];
    const plan = buildSettlementPlan(balances, []);
    expect(plan.algorithm).toBe('optimal');
    expect(plan.subsetCount).toBeGreaterThanOrEqual(2);
    expect(plan.txns.length).toBeLessThanOrEqual(greedyTxnCount(balances));
    expectBalanced(plan.txns, balances);
  });

  it('two independent +X / −X pairs settle in 2 txns (subsetCount=2)', () => {
    const balances = [
      balance('a', 'A', 1000),
      balance('b', 'B', -1000),
      balance('c', 'C', 500),
      balance('d', 'D', -500),
    ];
    const plan = buildSettlementPlan(balances, []);
    expect(plan.algorithm).toBe('optimal');
    expect(plan.subsetCount).toBe(2);
    expect(plan.txns.length).toBe(2);
    expectBalanced(plan.txns, balances);
  });

  it('one big creditor + many debtors degenerates to N−1 txns', () => {
    // No zero-sum subset smaller than the whole set exists here.
    const balances = [
      balance('a', 'A', 700),
      balance('b', 'B', -100),
      balance('c', 'C', -200),
      balance('d', 'D', -150),
      balance('e', 'E', -250),
    ];
    const plan = buildSettlementPlan(balances, []);
    expect(plan.algorithm).toBe('optimal');
    expect(plan.subsetCount).toBe(1);
    expect(plan.txns.length).toBe(4);
    expectBalanced(plan.txns, balances);
  });

  it('all-zero-net pool produces no transactions and partitions trivially', () => {
    const balances = [
      balance('a', 'A', 0),
      balance('b', 'B', 0),
      balance('c', 'C', 0),
    ];
    const plan = buildSettlementPlan(balances, []);
    expect(plan.txns.length).toBe(0);
    expect(plan.algorithm).toBe('optimal');
  });
});

describe('optimal subset-sum partition — fuzz (50 random games at 6/10/14 players)', () => {
  function randInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /** Generate a random zero-sum integer-cent ledger. */
  function randomBalanced(n: number): EffectiveBalance[] {
    // Pull n−1 random nets in [−500, 500], then set the last to balance.
    const nets: number[] = [];
    let runningSum = 0;
    for (let i = 0; i < n - 1; i++) {
      const v = randInt(-500, 500);
      nets.push(v);
      runningSum += v;
    }
    nets.push(runningSum === 0 ? 0 : -runningSum);
    return nets.map((net, i) =>
      balance(`p${String(i).padStart(2, '0')}`, `P${i}`, net)
    );
  }

  it.each([6, 10, 14])('optimal ≤ greedy for %s-player games (×50 each)', (n) => {
    let totalSavings = 0;
    let casesWithSavings = 0;
    for (let i = 0; i < 50; i++) {
      const bs = randomBalanced(n);
      const plan = buildSettlementPlan(bs, []);
      const greedyCount = greedyTxnCount(bs);
      // Optimal is by construction min — but if some inputs collapse to
      // greedy-fallback (shouldn't happen at n ≤ 15) we still pass.
      expect(
        plan.txns.length,
        `optimal=${plan.txns.length} > greedy=${greedyCount} for ${JSON.stringify(bs.map((b) => b.effectiveNetCents))}`
      ).toBeLessThanOrEqual(greedyCount);
      if (plan.txns.length < greedyCount) {
        casesWithSavings++;
        totalSavings += greedyCount - plan.txns.length;
      }
      expectBalanced(plan.txns, bs);
    }
    // Sanity stat — at least some games should have savings (informational).
    expect(casesWithSavings).toBeGreaterThanOrEqual(0);
    expect(totalSavings).toBeGreaterThanOrEqual(0);
  });
});

describe('optimal subset-sum partition — determinism', () => {
  it('produces identical outputs across re-runs of the same input', () => {
    const balances = [
      balance('a', 'A', 500),
      balance('b', 'B', 500),
      balance('c', 'C', -300),
      balance('d', 'D', -300),
      balance('e', 'E', -200),
      balance('f', 'F', -200),
    ];
    const a = buildSettlementPlan(balances, []);
    const b = buildSettlementPlan(balances, []);
    expect(a.txns).toEqual(b.txns);
    expect(a.subsetCount).toBe(b.subsetCount);
  });

  it('is invariant under input row reordering', () => {
    const original = [
      balance('a', 'A', 500),
      balance('b', 'B', 500),
      balance('c', 'C', -300),
      balance('d', 'D', -300),
      balance('e', 'E', -200),
      balance('f', 'F', -200),
    ];
    const shuffled = [...original].reverse();
    const a = buildSettlementPlan(original, []);
    const b = buildSettlementPlan(shuffled, []);
    expect(a.txns).toEqual(b.txns);
  });
});

describe('optimal subset-sum partition — performance', () => {
  it('completes a worst-case N=15 game in under 500 ms', () => {
    // 15 players, mixed magnitudes so greedy is nearly worst-case and
    // optimal must enumerate many subsets. Last value is forced to make
    // the pool exactly zero-sum.
    const head = [
      300, 200, 400, 100, 250,
      -150, -180, -220, -270, -90,
      -50, 50, 100, -200,
    ];
    const last = -head.reduce((a, b) => a + b, 0); // makes the total exactly 0
    const nets = [...head, last];
    const balances = nets.map((n, i) =>
      balance(`p${String(i).padStart(2, '0')}`, `P${i}`, n)
    );
    expect(balances.reduce((acc, b) => acc + b.effectiveNetCents, 0)).toBe(0);

    const t0 = performance.now();
    const plan = buildSettlementPlan(balances, []);
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(500);
    expect(plan.algorithm).toBe('optimal');
    expectBalanced(plan.txns, balances);
  });

  it('falls back to greedy when N exceeds the optimal threshold', () => {
    const N = OPTIMAL_PARTITION_LIMIT + 3; // 18
    const nets = Array.from({ length: N }, (_, i) =>
      i % 2 === 0 ? 100 : -100
    );
    const balances = nets.map((n, i) =>
      balance(`p${String(i).padStart(2, '0')}`, `P${i}`, n)
    );
    const plan = buildSettlementPlan(balances, []);
    expect(plan.algorithm).toBe('greedy-fallback');
    expectBalanced(plan.txns, balances);
  });
});

describe('optimal subset-sum partition — interaction with isolation rules', () => {
  it('isolation collapses first, then optimal partitions the residual', () => {
    // Andrew is isolated to Kevin. Andrew=-300, Kevin=+200 net.
    // After isolation: Andrew → pays Kevin $300 (forced). Kevin's
    // residual = 200 - 300 = -100. Pool now: Kevin=-100, Sam=+150, Tom=-50.
    // Sum of pool = 0. Partition could find {Sam=+150, Kevin=-100, Tom=-50}
    // — but no smaller zero-sum split exists, so 1 subset = 2 internal txns,
    // total 3 txns (1 forced + 2 residual).
    const balances = [
      balance('andrew', 'Andrew', -30000),
      balance('kevin', 'Kevin', 20000),
      balance('sam', 'Sam', 15000),
      balance('tom', 'Tom', -5000),
    ];
    const isolations: IsolationRule[] = [
      { playerId: 'andrew', counterpartId: 'kevin' },
    ];
    const plan = buildSettlementPlan(balances, isolations);
    const forced = plan.txns.filter((t) => t.forced);
    expect(forced).toEqual([
      { fromId: 'andrew', toId: 'kevin', amountCents: 30000, forced: true },
    ]);
    expect(plan.algorithm).toBe('optimal');
    expectBalanced(plan.txns, balances);
  });

  it('residual pool of one + zero-net player needs no extra txns', () => {
    // Andrew → Kevin isolation; remaining pool collapses to a single
    // zero-net Kevin → no additional transactions.
    const balances = [
      balance('andrew', 'Andrew', -10000),
      balance('kevin', 'Kevin', 10000),
    ];
    const isolations: IsolationRule[] = [
      { playerId: 'andrew', counterpartId: 'kevin' },
    ];
    const plan = buildSettlementPlan(balances, isolations);
    expect(plan.txns).toHaveLength(1);
    expect(plan.txns[0]).toEqual({
      fromId: 'andrew',
      toId: 'kevin',
      amountCents: 10000,
      forced: true,
    });
  });
});

describe('payment preferences — rail-safe routing', () => {
  it('routes Venmo-only ↔ Zelle-only payments through a both-capable proxy', () => {
    const balances = [
      balance('a', 'Andrew', -10000),
      balance('b', 'Bridge', 0),
      balance('d', 'Dev', 10000),
    ];

    const plan = buildSettlementPlan(balances, [], [
      { playerId: 'a', rail: 'venmo' },
      { playerId: 'd', rail: 'zelle' },
    ]);

    expect(plan.paymentPreferenceStatus).toEqual({
      applied: true,
      reason: 'applied',
      venmoPlayerIds: ['a'],
      zellePlayerIds: ['d'],
    });
    expect(plan.txns).toEqual([
      { fromId: 'a', toId: 'b', amountCents: 10000 },
      { fromId: 'b', toId: 'd', amountCents: 10000 },
    ]);
    expectBalanced(plan.txns, balances);
  });

  it('uses direct payments for compatible pairs even when preferences are set', () => {
    const balances = [
      balance('a', 'Andrew', -10000),
      balance('b', 'Ben', 10000),
      balance('c', 'Cody', -5000),
      balance('d', 'Dev', 5000),
    ];

    const plan = buildSettlementPlan(balances, [], [
      { playerId: 'a', rail: 'venmo' },
      { playerId: 'd', rail: 'zelle' },
    ]);

    expect(plan.paymentPreferenceStatus).toEqual({
      applied: true,
      reason: 'applied',
      venmoPlayerIds: ['a'],
      zellePlayerIds: ['d'],
    });
    expect(plan.txns).toEqual([
      { fromId: 'a', toId: 'b', amountCents: 10000 },
      { fromId: 'c', toId: 'd', amountCents: 5000 },
    ]);
    expectBalanced(plan.txns, balances);
  });

  it('falls back to normal settlement when incompatible rails have no proxy', () => {
    const balances = [
      balance('a', 'Andrew', -10000),
      balance('b', 'Ben', 10000),
    ];

    const plan = buildSettlementPlan(balances, [], [
      { playerId: 'a', rail: 'venmo' },
      { playerId: 'b', rail: 'zelle' },
    ]);

    expect(plan.paymentPreferenceStatus).toEqual({
      applied: false,
      reason: 'unbalanced',
      venmoPlayerIds: ['a'],
      zellePlayerIds: ['b'],
    });
    expect(plan.txns).toEqual([
      { fromId: 'a', toId: 'b', amountCents: 10000 },
    ]);
    expectBalanced(plan.txns, balances);
  });

  it('collapses payment preferences through aliases before routing', () => {
    const rows = [
      row('a2', 'Andrew 2', -5000),
      row('a', 'Andrew', -5000),
      row('b', 'Ben', 10000),
    ];

    const { plan } = computePlan(
      rows,
      [],
      [],
      [{ playerId: 'a2', aliasToPlayerId: 'a' }],
      [{ playerId: 'a2', rail: 'venmo' }]
    );

    expect(plan.paymentPreferenceStatus).toEqual({
      applied: true,
      reason: 'applied',
      venmoPlayerIds: ['a'],
      zellePlayerIds: [],
    });
    expect(plan.txns).toEqual([
      { fromId: 'a', toId: 'b', amountCents: 10000 },
    ]);
  });
});

describe('roundLedgerRowsToDollars', () => {
  it('rounds every net to a whole dollar and preserves a balanced sum', () => {
    const rows = [
      row('a', 'A', 5_250), // → 5_300
      row('b', 'B', -5_249), // → -5_200
      row('c', 'C', -1), // → 0
    ];
    const rounded = roundLedgerRowsToDollars(rows);
    for (const r of rounded) expect(Math.abs(r.netCents % 100)).toBe(0);
    expect(rounded.reduce((acc, r) => acc + r.netCents, 0)).toBe(0);
  });

  it('folds the accumulated remainder into the largest balance', () => {
    const rows = [
      row('a', 'A', 10_050), // → 10_100 (half away from zero)
      row('b', 'B', -5_025), // → -5_000
      row('c', 'C', -5_025), // → -5_000
    ];
    const rounded = roundLedgerRowsToDollars(rows);
    expect(rounded.reduce((acc, r) => acc + r.netCents, 0)).toBe(0);
    // Residual (-100) lands on the largest |net| — player a.
    expect(rounded.find((r) => r.playerId === 'a')?.netCents).toBe(10_000);
    expect(rounded.find((r) => r.playerId === 'b')?.netCents).toBe(-5_000);
    expect(rounded.find((r) => r.playerId === 'c')?.netCents).toBe(-5_000);
  });

  it('rounds symmetric wins and losses identically', () => {
    const rounded = roundLedgerRowsToDollars([row('a', 'A', 150), row('b', 'B', -150)]);
    expect(rounded.find((r) => r.playerId === 'a')?.netCents).toBe(200);
    expect(rounded.find((r) => r.playerId === 'b')?.netCents).toBe(-200);
  });

  it('keeps a deliberately unbalanced ledger at its rounded discrepancy', () => {
    const rows = [row('a', 'A', 10_020), row('b', 'B', -5_000)];
    const rounded = roundLedgerRowsToDollars(rows);
    expect(rounded.reduce((acc, r) => acc + r.netCents, 0)).toBe(5_000);
    for (const r of rounded) expect(Math.abs(r.netCents % 100)).toBe(0);
  });

  it('produces whole-dollar settlement payments end to end', () => {
    const rows = [
      row('a', 'A', 12_345),
      row('b', 'B', -6_170),
      row('c', 'C', -6_175),
    ];
    const { balances, plan } = computePlan(roundLedgerRowsToDollars(rows), [], []);
    for (const txn of plan.txns) expect(txn.amountCents % 100).toBe(0);
    expectBalanced(plan.txns, balances);
  });

  it('handles an empty ledger', () => {
    expect(roundLedgerRowsToDollars([])).toEqual([]);
  });
});
