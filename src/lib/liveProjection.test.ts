import { describe, expect, it } from 'vitest';
import {
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

    const kevin = deriveLivePlayerSummaries(snap).find(
      (summary) => summary.playerId === 'kevin'
    );
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

  it('blocks finalization when buy-ins and cashouts do not balance', () => {
    const snap = snapshot([
      entry('e1', 'kevin', 'buy_in', 10_000),
      entry('e2', 'kevin', 'cash_out', 0, { isFinal: true }),
    ]);

    const result = validateLiveFinalization(snap);
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => /off by/i.test(error))).toBe(true);
  });

  it('does not treat an inactive host row as financial activity', () => {
    const snap = snapshot([]);

    const result = validateLiveFinalization(snap);
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => /activity/i.test(error))).toBe(true);
  });
});
