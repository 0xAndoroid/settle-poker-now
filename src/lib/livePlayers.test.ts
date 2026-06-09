import { describe, expect, it } from 'vitest';
import { activeLivePlayers, sendLossToHostOffer } from './livePlayers';
import { deriveLiveBankSummary, deriveLivePlayerSummaries } from './liveProjection';
import type { LiveGameSnapshot, LivePlayer, LivePlayerSummary } from './types';

const now = 1_700_000_000_000;

function player(playerId: string, name: string, extra: Partial<LivePlayer> = {}): LivePlayer {
  return {
    gameId: 'live1',
    playerId,
    name,
    isHost: false,
    status: 'active',
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    ...extra,
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

/**
 * Replays the server's status transitions (`statusUpdateForEntry`): a final
 * cashout marks the player busted/cashed_out, a later buy-in reactivates.
 * Explicit non-active statuses (e.g. removed) are kept as-is.
 */
function statusFromEntries(
  player: LivePlayer,
  entries: LiveGameSnapshot['entries']
): LivePlayer['status'] {
  if (player.status !== 'active') return player.status;
  let status: LivePlayer['status'] = 'active';
  const rows = entries
    .filter((row) => row.playerId === player.playerId && row.voidedAt === null)
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt);
  for (const row of rows) {
    if (row.entryType === 'cash_out' && row.isFinal) {
      status = row.amountCents === 0 ? 'busted' : 'cashed_out';
    } else if (row.entryType === 'buy_in' && status !== 'active') {
      status = 'active';
    }
  }
  return status;
}

function snapshot(args: {
  players: LivePlayer[];
  entries: LiveGameSnapshot['entries'];
  hostPlayerId?: string | null;
  status?: LiveGameSnapshot['game']['status'];
}): LiveGameSnapshot {
  const game: LiveGameSnapshot['game'] = {
    id: 'live1',
    status: args.status ?? 'active',
    hostPlayerId: args.hostPlayerId === undefined ? 'host' : args.hostPlayerId,
    title: null,
    note: null,
    totalChipBankCents: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    finalizedAt: null,
    finalizedGameId: null,
  };
  const players = args.players.map((row) => ({
    ...row,
    status: statusFromEntries(row, args.entries),
  }));
  const base = {
    game,
    players,
    entries: args.entries,
    chipCheckpoints: [],
    audit: [],
  };
  return {
    ...base,
    playerSummaries: deriveLivePlayerSummaries(players, args.entries),
    bankSummary: deriveLiveBankSummary(game, args.entries, []),
  };
}

function summaryOf(snap: LiveGameSnapshot, playerId: string): LivePlayerSummary {
  const summary = snap.playerSummaries.find((row) => row.playerId === playerId);
  if (!summary) throw new Error(`no summary for ${playerId}`);
  return summary;
}

const host = player('host', 'Andrew', { isHost: true });
const kevin = player('kevin', 'Kevin', { sortOrder: 1 });

describe('activeLivePlayers', () => {
  it('drops removed players and sorts by sortOrder', () => {
    const snap = snapshot({
      players: [kevin, host, player('gone', 'Gone', { status: 'removed', sortOrder: 2 })],
      entries: [],
    });
    expect(activeLivePlayers(snap).map((p) => p.playerId)).toEqual(['host', 'kevin']);
  });
});

describe('sendLossToHostOffer', () => {
  it('offers the full net loss after a final cashout', () => {
    const snap = snapshot({
      players: [host, kevin],
      entries: [
        entry('e1', 'kevin', 'buy_in', 10_000),
        entry('e2', 'kevin', 'cash_out', 4_000, { isFinal: true }),
      ],
    });
    expect(sendLossToHostOffer(snap, summaryOf(snap, 'kevin'))).toEqual({
      hostPlayerId: 'host',
      hostName: 'Andrew',
      amountCents: 6_000,
    });
  });

  it('sums multiple rebuys into the loss', () => {
    const snap = snapshot({
      players: [host, kevin],
      entries: [
        entry('e1', 'kevin', 'buy_in', 10_000),
        entry('e2', 'kevin', 'buy_in', 5_000),
        entry('e3', 'kevin', 'cash_out', 2_500, { isFinal: true }),
      ],
    });
    expect(sendLossToHostOffer(snap, summaryOf(snap, 'kevin'))?.amountCents).toBe(12_500);
  });

  it('offers the full buy-in for a busted player (zero final cashout)', () => {
    const snap = snapshot({
      players: [host, kevin],
      entries: [
        entry('e1', 'kevin', 'buy_in', 10_000),
        entry('e2', 'kevin', 'cash_out', 0, { isFinal: true }),
      ],
    });
    expect(sendLossToHostOffer(snap, summaryOf(snap, 'kevin'))?.amountCents).toBe(10_000);
  });

  it('subtracts prior payments already sent', () => {
    const snap = snapshot({
      players: [host, kevin],
      entries: [
        entry('e1', 'kevin', 'buy_in', 10_000),
        entry('e2', 'kevin', 'cash_out', 4_000, { isFinal: true }),
        entry('e3', 'kevin', 'prior_payment', 2_000, { toPlayerId: 'host' }),
      ],
    });
    expect(sendLossToHostOffer(snap, summaryOf(snap, 'kevin'))?.amountCents).toBe(4_000);
  });

  it('returns null once prior payments cover the loss (already settled)', () => {
    const snap = snapshot({
      players: [host, kevin],
      entries: [
        entry('e1', 'kevin', 'buy_in', 10_000),
        entry('e2', 'kevin', 'cash_out', 4_000, { isFinal: true }),
        entry('e3', 'kevin', 'prior_payment', 6_000, { toPlayerId: 'host' }),
      ],
    });
    expect(sendLossToHostOffer(snap, summaryOf(snap, 'kevin'))).toBeNull();
  });

  it('adds payments the player received to what they still owe', () => {
    const snap = snapshot({
      players: [host, kevin],
      entries: [
        entry('e1', 'kevin', 'buy_in', 10_000),
        entry('e2', 'kevin', 'cash_out', 4_000, { isFinal: true }),
        entry('e3', 'host', 'prior_payment', 1_500, { toPlayerId: 'kevin' }),
      ],
    });
    expect(sendLossToHostOffer(snap, summaryOf(snap, 'kevin'))?.amountCents).toBe(7_500);
  });

  it('ignores voided entries', () => {
    const snap = snapshot({
      players: [host, kevin],
      entries: [
        entry('e1', 'kevin', 'buy_in', 10_000),
        entry('e2', 'kevin', 'cash_out', 4_000, { isFinal: true }),
        entry('e3', 'kevin', 'prior_payment', 6_000, { toPlayerId: 'host', voidedAt: now }),
      ],
    });
    expect(sendLossToHostOffer(snap, summaryOf(snap, 'kevin'))?.amountCents).toBe(6_000);
  });

  it('withdraws the offer when a rebuy reactivates the player', () => {
    const snap = snapshot({
      players: [host, kevin],
      entries: [
        entry('e1', 'kevin', 'buy_in', 10_000),
        entry('e2', 'kevin', 'cash_out', 0, { isFinal: true }),
        entry('e3', 'kevin', 'buy_in', 5_000),
      ],
    });
    expect(sendLossToHostOffer(snap, summaryOf(snap, 'kevin'))).toBeNull();
  });

  it('returns null before the final cashout', () => {
    const snap = snapshot({
      players: [host, kevin],
      entries: [entry('e1', 'kevin', 'buy_in', 10_000), entry('e2', 'kevin', 'cash_out', 4_000)],
    });
    expect(sendLossToHostOffer(snap, summaryOf(snap, 'kevin'))).toBeNull();
  });

  it('returns null for winners and break-even players', () => {
    const snap = snapshot({
      players: [host, kevin, player('maya', 'Maya', { sortOrder: 2 })],
      entries: [
        entry('e1', 'kevin', 'buy_in', 10_000),
        entry('e2', 'kevin', 'cash_out', 15_000, { isFinal: true }),
        entry('e3', 'maya', 'buy_in', 10_000),
        entry('e4', 'maya', 'cash_out', 10_000, { isFinal: true }),
      ],
    });
    expect(sendLossToHostOffer(snap, summaryOf(snap, 'kevin'))).toBeNull();
    expect(sendLossToHostOffer(snap, summaryOf(snap, 'maya'))).toBeNull();
  });

  it('returns null for the host themselves', () => {
    const snap = snapshot({
      players: [host, kevin],
      entries: [
        entry('e1', 'host', 'buy_in', 10_000),
        entry('e2', 'host', 'cash_out', 0, { isFinal: true }),
      ],
    });
    expect(sendLossToHostOffer(snap, summaryOf(snap, 'host'))).toBeNull();
  });

  it('returns null when no host is set or the host was removed', () => {
    const noHost = snapshot({
      players: [player('host', 'Andrew'), kevin],
      entries: [
        entry('e1', 'kevin', 'buy_in', 10_000),
        entry('e2', 'kevin', 'cash_out', 0, { isFinal: true }),
      ],
      hostPlayerId: null,
    });
    expect(sendLossToHostOffer(noHost, summaryOf(noHost, 'kevin'))).toBeNull();

    const removedHost = snapshot({
      players: [player('host', 'Andrew', { isHost: true, status: 'removed' }), kevin],
      entries: [
        entry('e1', 'kevin', 'buy_in', 10_000),
        entry('e2', 'kevin', 'cash_out', 0, { isFinal: true }),
      ],
    });
    expect(sendLossToHostOffer(removedHost, summaryOf(removedHost, 'kevin'))).toBeNull();
  });

  it('returns null for removed players and inactive games', () => {
    const removed = snapshot({
      players: [host, player('kevin', 'Kevin', { status: 'removed', sortOrder: 1 })],
      entries: [
        entry('e1', 'kevin', 'buy_in', 10_000),
        entry('e2', 'kevin', 'cash_out', 0, { isFinal: true }),
      ],
    });
    expect(sendLossToHostOffer(removed, summaryOf(removed, 'kevin'))).toBeNull();

    const finalized = snapshot({
      players: [host, kevin],
      entries: [
        entry('e1', 'kevin', 'buy_in', 10_000),
        entry('e2', 'kevin', 'cash_out', 0, { isFinal: true }),
      ],
      status: 'finalized',
    });
    expect(sendLossToHostOffer(finalized, summaryOf(finalized, 'kevin'))).toBeNull();
  });
});
