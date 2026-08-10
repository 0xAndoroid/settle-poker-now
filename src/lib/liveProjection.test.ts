import { describe, expect, it } from 'vitest';
import {
  balanceFinalLedgerRows,
  deriveFinalLedgerRows,
  deriveLiveBankSummary,
  deriveLivePlayerSummaries,
  derivePriorPaymentAdjustments,
  validateLiveFinalization,
} from './liveProjection';
import type { LiveGameSnapshot } from './types';

const now = 1_700_000_000_000;

function snapshot(
  entries: LiveGameSnapshot['entries'],
  totalChipBankCents: number | null = null
): LiveGameSnapshot {
  const players: LiveGameSnapshot['players'] = [
    {
      gameId: 'live1',
      playerId: 'host',
      name: 'Andrew',
      isHost: true,
      status: 'active',
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      gameId: 'live1',
      playerId: 'kevin',
      name: 'Kevin',
      isHost: false,
      status: 'active',
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    },
  ];
  const game: LiveGameSnapshot['game'] = {
    id: 'live1',
    status: 'active',
    hostPlayerId: 'host',
    title: null,
    note: null,
    totalChipBankCents,
    version: 1,
    createdAt: now,
    updatedAt: now,
    finalizedAt: null,
    finalizedGameId: null,
  };
  const base = {
    game,
    players,
    entries,
    chipCheckpoints: [],
    audit: [],
  };
  return {
    ...base,
    playerSummaries: deriveLivePlayerSummaries(players, entries),
    bankSummary: deriveLiveBankSummary(game, entries, []),
  };
}

function entry(
  id: string,
  playerId: string,
  entryType: LiveGameSnapshot['entries'][number]['entryType'],
  amountCents: number,
  extra: Partial<LiveGameSnapshot['entries'][number]> = {}
): LiveGameSnapshot['entries'][number] {
  return {
    id,
    gameId: 'live1',
    playerId,
    entryType,
    amountCents,
    toPlayerId: null,
    paymentMethod: null,
    isFinal: false,
    note: null,
    clientEventId: id,
    createdAt: now + Number(id.replace(/\D/g, '') || 0),
    createdBy: null,
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
    ...extra,
  };
}

describe('liveProjection', () => {
  it('sums multiple buy-ins for a player', () => {
    const snap = snapshot([
      entry('e1', 'kevin', 'buy_in', 4_000),
      entry('e2', 'kevin', 'buy_in', 6_000),
      entry('e3', 'kevin', 'cash_out', 10_000, { isFinal: true }),
    ]);

    const kevin = deriveLivePlayerSummaries(snap).find((summary) => summary.playerId === 'kevin');
    expect(kevin?.buyInCents).toBe(10_000);
    expect(kevin?.cashOutCents).toBe(10_000);
    expect(kevin?.netCents).toBe(0);
  });

  it('derives a zero-cashout bust as a final row', () => {
    const snap = snapshot([
      entry('e1', 'kevin', 'buy_in', 10_000),
      entry('e2', 'kevin', 'cash_out', 0, { isFinal: true }),
      entry('e3', 'host', 'buy_in', 10_000),
      entry('e4', 'host', 'cash_out', 20_000, { isFinal: true }),
    ]);

    const rows = deriveFinalLedgerRows(snap);
    expect(rows.find((row) => row.playerId === 'kevin')).toMatchObject({
      buyInCents: 10_000,
      buyOutCents: 0,
      netCents: -10_000,
    });
    expect(validateLiveFinalization(snap).ok).toBe(true);
  });

  it('turns prior payments to the host into settlement adjustments', () => {
    const snap = snapshot([
      entry('e1', 'kevin', 'buy_in', 10_000),
      entry('e2', 'kevin', 'cash_out', 0, { isFinal: true }),
      entry('e3', 'host', 'buy_in', 10_000),
      entry('e4', 'host', 'cash_out', 20_000, { isFinal: true }),
      entry('e5', 'kevin', 'prior_payment', 10_000, {
        toPlayerId: 'host',
        paymentMethod: 'venmo',
      }),
    ]);

    expect(derivePriorPaymentAdjustments(snap)).toEqual([
      {
        id: 'e5',
        fromId: 'kevin',
        toId: 'host',
        amountCents: 10_000,
      },
    ]);
  });

  it('computes chip bank formulas for table and bank counts', () => {
    const snap = snapshot(
      [
        entry('e1', 'kevin', 'buy_in', 40_000),
        entry('e2', 'host', 'buy_in', 60_000),
        entry('e3', 'kevin', 'cash_out', 25_000),
      ],
      200_000
    );
    const withCounts: LiveGameSnapshot = {
      ...snap,
      chipCheckpoints: [
        {
          id: 'c1',
          gameId: 'live1',
          checkpointType: 'verify_table_count',
          amountCents: 74_500,
          expectedCents: 75_000,
          deltaCents: -500,
          note: null,
          clientEventId: 'c1',
          createdAt: now,
          createdBy: null,
        },
        {
          id: 'c2',
          gameId: 'live1',
          checkpointType: 'verify_bank_count',
          amountCents: 125_500,
          expectedCents: 125_000,
          deltaCents: 500,
          note: null,
          clientEventId: 'c2',
          createdAt: now + 1,
          createdBy: null,
        },
      ],
    };

    expect(deriveLiveBankSummary(withCounts)).toMatchObject({
      totalChipBankCents: 200_000,
      chipsInPlayCents: 75_000,
      expectedBankOnHandCents: 125_000,
      latestTableDeltaCents: -500,
      latestBankDeltaCents: 500,
    });
  });

  it('allows finalization with proportional balance adjustments', () => {
    const snap = snapshot([
      entry('e1', 'kevin', 'buy_in', 10_000),
      entry('e2', 'kevin', 'cash_out', 0, { isFinal: true }),
      entry('e3', 'host', 'buy_in', 10_000),
      entry('e4', 'host', 'cash_out', 15_000, { isFinal: true }),
    ]);

    const result = validateLiveFinalization(snap);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.proportionalAdjustments).toEqual([
      { playerId: 'host', amountCents: 5_000, basisCents: 15_000 },
    ]);
    expect(result.rows.reduce((acc, row) => acc + row.netCents, 0)).toBe(0);
    expect(result.rawRows.reduce((acc, row) => acc + row.netCents, 0)).toBe(-5_000);
  });

  it('balances final rows without overwriting raw cashout totals', () => {
    const rawRows = [
      {
        playerId: 'kevin',
        nickname: 'Kevin',
        buyInCents: 10_000,
        buyOutCents: 0,
        netCents: -10_000,
      },
      {
        playerId: 'host',
        nickname: 'Andrew',
        buyInCents: 10_000,
        buyOutCents: 15_000,
        netCents: 5_000,
      },
    ];

    const result = balanceFinalLedgerRows(rawRows);
    expect(result.rows.find((row) => row.playerId === 'host')).toMatchObject({
      buyOutCents: 15_000,
      netCents: 10_000,
    });
  });

  it('balances surplus cashouts before settlement', () => {
    const snap = snapshot([
      entry('e1', 'kevin', 'buy_in', 10_000),
      entry('e2', 'kevin', 'cash_out', 0, { isFinal: true }),
      entry('e3', 'host', 'buy_in', 10_000),
      entry('e4', 'host', 'cash_out', 30_000, { isFinal: true }),
    ]);

    const result = validateLiveFinalization(snap);

    expect(result.ok).toBe(true);
    expect(result.rawRows.reduce((acc, row) => acc + row.netCents, 0)).toBe(10_000);
    expect(result.rows.reduce((acc, row) => acc + row.netCents, 0)).toBe(0);
    expect(result.proportionalAdjustments).toEqual([
      { playerId: 'host', amountCents: -10_000, basisCents: 30_000 },
    ]);
  });

  it('balances live finalization rows with proportional cashout adjustments', () => {
    const snap = snapshot([
      entry('e1', 'kevin', 'buy_in', 10_500),
      entry('e2', 'kevin', 'cash_out', 5_000, { isFinal: true }),
      entry('e3', 'host', 'buy_in', 10_500),
      entry('e4', 'host', 'cash_out', 15_000, { isFinal: true }),
    ]);

    const result = validateLiveFinalization(snap);
    const rawTotal = result.rawRows.reduce((acc, row) => acc + row.netCents, 0);
    const adjustedTotal = result.rows.reduce((acc, row) => acc + row.netCents, 0);

    expect(result.ok).toBe(true);
    expect(rawTotal).toBe(-1_000);
    expect(adjustedTotal).toBe(0);
    expect(result.proportionalAdjustments).toEqual([
      { playerId: 'host', amountCents: 750, basisCents: 15_000 },
      { playerId: 'kevin', amountCents: 250, basisCents: 5_000 },
    ]);
    expect(result.rows.find((row) => row.playerId === 'kevin')).toMatchObject({
      buyOutCents: 5_000,
      netCents: -5_250,
    });
    expect(result.rows.find((row) => row.playerId === 'host')).toMatchObject({
      buyOutCents: 15_000,
      netCents: 5_250,
    });
  });

  it('does not treat an inactive host row as financial activity', () => {
    const snap = snapshot([]);

    const result = validateLiveFinalization(snap);
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => /activity/i.test(error))).toBe(true);
  });

  it('flags the balanced check as a warning when proportional adjustments cover a gap', () => {
    const snap = snapshot([
      entry('e1', 'kevin', 'buy_in', 10_000),
      entry('e2', 'kevin', 'cash_out', 0, { isFinal: true }),
      entry('e3', 'host', 'buy_in', 10_000),
      entry('e4', 'host', 'cash_out', 15_000, { isFinal: true }),
    ]);

    const result = validateLiveFinalization(snap);
    const balanced = result.checks.find((check) => check.key === 'balanced');
    expect(balanced).toMatchObject({ ok: true, warn: true });
    expect(
      result.checks.find((check) => check.key === 'proportional_adjustments')
    ).toMatchObject({ ok: true, warn: true });
  });

  it('keeps the balanced check green when cashouts match buy-ins exactly', () => {
    const snap = snapshot([
      entry('e1', 'kevin', 'buy_in', 10_000),
      entry('e2', 'kevin', 'cash_out', 0, { isFinal: true }),
      entry('e3', 'host', 'buy_in', 10_000),
      entry('e4', 'host', 'cash_out', 20_000, { isFinal: true }),
    ]);

    const balanced = validateLiveFinalization(snap).checks.find(
      (check) => check.key === 'balanced'
    );
    expect(balanced).toMatchObject({ ok: true, warn: false });
  });

  it('rounds the final ledger to whole dollars when requested', () => {
    const snap = snapshot([
      entry('e1', 'kevin', 'buy_in', 10_500),
      entry('e2', 'kevin', 'cash_out', 5_000, { isFinal: true }),
      entry('e3', 'host', 'buy_in', 10_500),
      entry('e4', 'host', 'cash_out', 15_000, { isFinal: true }),
    ]);

    const result = validateLiveFinalization(snap, { roundToDollars: true });
    expect(result.ok).toBe(true);
    for (const row of result.rows) {
      expect(Math.abs(row.netCents % 100)).toBe(0);
    }
    expect(result.rows.reduce((acc, row) => acc + row.netCents, 0)).toBe(0);
    // Proportionally-balanced nets were ±5_250; rounding lands on ±5_300 / ±5_200
    // is not required — only whole dollars and zero sum are.
  });
});

/**
 * Regression: a real game showed an early quitter up hundreds of dollars in
 * the running finalize preview. Mid-game the raw ledger is lopsided (buy-ins
 * without final cashouts), and `balanceFinalLedgerRows` distributed the entire
 * outstanding pool onto the only player with a cashout basis. Proportional
 * balancing must not run until every buy-in has a final cashout.
 */
describe('mid-game finalize preview', () => {
  const players: LiveGameSnapshot['players'] = [
    { playerId: 'host', name: 'Andrew', isHost: true },
    { playerId: 'kevin', name: 'Kevin', isHost: false },
    { playerId: 'sam', name: 'Sam', isHost: false },
  ].map((p, i) => ({
    gameId: 'live2',
    playerId: p.playerId,
    name: p.name,
    isHost: p.isHost,
    status: 'active',
    sortOrder: i,
    createdAt: now,
    updatedAt: now,
  }));

  function midGameSnapshot(entries: LiveGameSnapshot['entries']): LiveGameSnapshot {
    const game: LiveGameSnapshot['game'] = {
      id: 'live2',
      status: 'active',
      hostPlayerId: 'host',
      title: null,
      note: null,
      totalChipBankCents: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
      finalizedAt: null,
      finalizedGameId: null,
    };
    return {
      game,
      players,
      entries,
      chipCheckpoints: [],
      audit: [],
      playerSummaries: deriveLivePlayerSummaries(players, entries),
      bankSummary: deriveLiveBankSummary(game, entries, []),
    };
  }

  it('does not inflate an early cashed-out player with the in-play pool', () => {
    const snap = midGameSnapshot([
      entry('e1', 'sam', 'buy_in', 50_000),
      entry('e2', 'host', 'buy_in', 50_000),
      entry('e3', 'kevin', 'buy_in', 50_000),
      // Sam quits early: +$35 actual result. Host + Kevin still have all
      // their chips in play — no final cashouts yet.
      entry('e4', 'sam', 'cash_out', 53_500, { isFinal: true }),
    ]);

    const result = validateLiveFinalization(snap);
    const sam = result.rows.find((row) => row.playerId === 'sam');

    // Before the fix Sam's preview net was +100_000 (his +3_500 plus the
    // entire 96_500 still on the table).
    expect(sam?.netCents).toBe(3_500);
    expect(result.proportionalAdjustments).toEqual([]);
    expect(result.ok).toBe(false); // missing finals still block finalization
    expect(result.errors.some((error) => /final cashout/i.test(error))).toBe(true);
  });

  it('applies proportional balancing once every buy-in has a final cashout', () => {
    const snap = midGameSnapshot([
      entry('e1', 'sam', 'buy_in', 50_000),
      entry('e2', 'host', 'buy_in', 50_000),
      entry('e3', 'kevin', 'buy_in', 50_000),
      entry('e4', 'sam', 'cash_out', 53_500, { isFinal: true }),
      entry('e5', 'host', 'cash_out', 70_000, { isFinal: true }),
      entry('e6', 'kevin', 'cash_out', 25_000, { isFinal: true }),
    ]);

    const result = validateLiveFinalization(snap);
    expect(result.ok).toBe(true);
    // Raw ledger short by $15 → distributed across cashout bases.
    expect(result.rawRows.reduce((acc, row) => acc + row.netCents, 0)).toBe(-1_500);
    expect(result.rows.reduce((acc, row) => acc + row.netCents, 0)).toBe(0);
    expect(result.proportionalAdjustments.length).toBeGreaterThan(0);
  });
});
