import { describe, expect, it } from 'vitest';
import {
  findIsolationCycles,
  projectPersistedSnapshot,
  projectSettlementPlan,
} from './persistedProjection';
import type { PersistedGameSnapshot } from './types';

describe('findIsolationCycles', () => {
  it('returns empty for a chain', () => {
    expect(
      findIsolationCycles([
        { playerId: 'a', counterpartId: 'b' },
        { playerId: 'b', counterpartId: 'c' },
      ])
    ).toEqual([]);
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
    expect(findIsolationCycles([{ playerId: 'a', counterpartId: 'a' }])).toEqual(['a']);
  });

  it('isolates uninvolved players when a cycle exists', () => {
    expect(
      findIsolationCycles([
        { playerId: 'a', counterpartId: 'b' },
        { playerId: 'b', counterpartId: 'a' },
        { playerId: 'c', counterpartId: 'd' },
      ])
    ).toEqual(['a', 'b']);
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
      finalizedAt: null,
      finalizedBy: null,
      note: null,
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
    aliases: [],
    paymentMethods: [],
    audit: [],
  });

  it('translates persisted payments into a SettlementPlan', () => {
    const plan = projectSettlementPlan(baseSnap());
    expect(plan.txns).toEqual([{ fromId: 'a', toId: 'b', amountCents: 5000, forced: false }]);
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

describe('projectPersistedSnapshot', () => {
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
      finalizedAt: null,
      finalizedBy: null,
      note: null,
    },
    players: [
      { playerId: 'a', nickname: 'A', netCents: -3000, buyInCents: 10000, buyOutCents: 7000 },
      { playerId: 'a2', nickname: 'A Again', netCents: -2000, buyInCents: 5000, buyOutCents: 3000 },
      { playerId: 'b', nickname: 'B', netCents: 5000, buyInCents: 0, buyOutCents: 5000 },
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
    aliases: [{ playerId: 'a2', aliasToPlayerId: 'a', createdAt: 0, createdBy: null }],
    paymentMethods: [],
    audit: [],
  });

  it('keeps original rows uncollapsed but folds alias balances for settlement display', () => {
    const projection = projectPersistedSnapshot(baseSnap());

    expect(projection.originalRows.map((row) => row.playerId)).toEqual(['a', 'a2', 'b']);
    expect(projection.balances).toEqual([
      {
        playerId: 'a',
        nickname: 'A',
        originalNetCents: -5000,
        effectiveNetCents: -5000,
      },
      {
        playerId: 'b',
        nickname: 'B',
        originalNetCents: 5000,
        effectiveNetCents: 5000,
      },
    ]);
  });

  it('replays persisted adjustments against canonical player ids', () => {
    const snap = baseSnap();
    snap.adjustments = [
      {
        id: 'adj1',
        fromPlayerId: 'a2',
        toPlayerId: 'b',
        amountCents: 1000,
        createdAt: 0,
        createdBy: null,
      },
    ];

    const projection = projectPersistedSnapshot(snap);
    expect(projection.balances.find((b) => b.playerId === 'a')?.effectiveNetCents).toBe(-4000);
    expect(projection.balances.find((b) => b.playerId === 'b')?.effectiveNetCents).toBe(4000);
  });

  it('reports proportional live ledger adjustments from persisted net versus raw net', () => {
    const snap = baseSnap();
    snap.players[0] = {
      ...snap.players[0]!,
      netCents: -2800,
    };

    const projection = projectPersistedSnapshot(snap);
    expect(projection.proportionalAdjustments).toContainEqual({
      playerId: 'a',
      amountCents: 200,
    });
    expect(projection.originalRows.map((row) => row.netCents)).toEqual([-2800, -2000, 5000]);
    expect(projection.originalBalances[0]?.effectiveNetCents).toBe(-2800);
  });
});
