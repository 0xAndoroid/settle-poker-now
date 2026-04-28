import { describe, expect, it } from 'vitest';
import {
  findIsolationCycles,
  paymentKey,
  projectSettlementPlan,
} from './persistedProjection';
import type { PersistedGameSnapshot } from './types';

describe('findIsolationCycles', () => {
  it('returns empty for an empty graph', () => {
    expect(findIsolationCycles([])).toEqual([]);
  });

  it('returns empty for a chain', () => {
    expect(
      findIsolationCycles([
        { playerId: 'a', counterpartId: 'b' },
        { playerId: 'b', counterpartId: 'c' },
      ])
    ).toEqual([]);
  });

  it('detects a 2-cycle', () => {
    expect(
      findIsolationCycles([
        { playerId: 'a', counterpartId: 'b' },
        { playerId: 'b', counterpartId: 'a' },
      ])
    ).toEqual(['a', 'b']);
  });

  it('detects a 3-cycle', () => {
    expect(
      findIsolationCycles([
        { playerId: 'a', counterpartId: 'b' },
        { playerId: 'b', counterpartId: 'c' },
        { playerId: 'c', counterpartId: 'a' },
      ])
    ).toEqual(['a', 'b', 'c']);
  });

  it('detects a self-loop', () => {
    expect(
      findIsolationCycles([{ playerId: 'a', counterpartId: 'a' }])
    ).toEqual(['a']);
  });

  it('isolates uninvolved players when a cycle exists', () => {
    expect(
      findIsolationCycles([
        { playerId: 'a', counterpartId: 'b' },
        { playerId: 'b', counterpartId: 'a' }, // cycle: a, b
        { playerId: 'c', counterpartId: 'd' }, // chain, not cyclic
      ])
    ).toEqual(['a', 'b']);
  });
});

describe('paymentKey', () => {
  it('produces a stable key from from/to/amount', () => {
    expect(
      paymentKey({ fromId: 'andrew', toId: 'kevin', amountCents: 5000 })
    ).toBe('andrew|kevin|5000');
  });

  it('changes when any field differs (used for diffing across re-derivations)', () => {
    const a = paymentKey({ fromId: 'a', toId: 'b', amountCents: 100 });
    expect(paymentKey({ fromId: 'a', toId: 'b', amountCents: 101 })).not.toBe(a);
    expect(paymentKey({ fromId: 'a', toId: 'c', amountCents: 100 })).not.toBe(a);
    expect(paymentKey({ fromId: 'b', toId: 'a', amountCents: 100 })).not.toBe(a);
  });
});

describe('projectSettlementPlan', () => {
  const baseSnap = (): PersistedGameSnapshot => ({
    game: {
      id: 'abc12345',
      pokernowGameId: 'pokernow-test',
      sourceUnit: 'cents',
      unitProvenance: 'header',
      startedAt: 0,
      endedAt: 0,
      createdAt: 0,
      updatedAt: 0,
    },
    players: [
      { playerId: 'a', nickname: 'A', netCents: -5000 },
      { playerId: 'b', nickname: 'B', netCents: 5000 },
    ],
    payments: [
      {
        id: 'p1',
        fromPlayerId: 'a',
        toPlayerId: 'b',
        amountCents: 5000,
        forced: false,
        position: 0,
        completedAt: null,
        completedBy: null,
      },
    ],
    adjustments: [],
    isolations: [],
    audit: [],
  });

  it('translates persisted payments into a SettlementPlan', () => {
    const plan = projectSettlementPlan(baseSnap());
    expect(plan.txns).toEqual([
      { fromId: 'a', toId: 'b', amountCents: 5000, forced: false },
    ]);
    expect(plan.cyclePlayerIds).toEqual([]);
    expect(plan.isFullyBalanced).toBe(true);
  });

  it('flags cycle members + reports not-balanced when isolation rules cycle', () => {
    const snap = baseSnap();
    snap.isolations = [
      { playerId: 'a', counterpartId: 'b', createdAt: 0 },
      { playerId: 'b', counterpartId: 'a', createdAt: 0 },
    ];
    const plan = projectSettlementPlan(snap);
    expect(plan.cyclePlayerIds.sort()).toEqual(['a', 'b']);
    expect(plan.isFullyBalanced).toBe(false);
  });

  it('preserves the `forced` flag on isolated-payment txns', () => {
    const snap = baseSnap();
    snap.payments = [
      {
        id: 'p1',
        fromPlayerId: 'a',
        toPlayerId: 'b',
        amountCents: 5000,
        forced: true,
        position: 0,
        completedAt: null,
        completedBy: null,
      },
    ];
    const plan = projectSettlementPlan(snap);
    expect(plan.txns[0]!.forced).toBe(true);
  });
});
