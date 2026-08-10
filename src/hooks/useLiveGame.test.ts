import { describe, expect, it } from 'vitest';
import { projectPending } from './useLiveGame';
import { deriveLiveBankSummary, deriveLivePlayerSummaries } from '@/lib/liveProjection';
import type { LiveOutboxItem } from '@/lib/liveStorage';
import type { LiveEntry, LiveGameSnapshot } from '@/lib/types';

const now = 1_700_000_000_000;

function entry(id: string, playerId: string, amountCents: number): LiveEntry {
  return {
    id,
    gameId: 'live1',
    playerId,
    entryType: 'buy_in',
    amountCents,
    toPlayerId: null,
    paymentMethod: null,
    isFinal: false,
    note: null,
    clientEventId: id,
    createdAt: now,
    createdBy: null,
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
  };
}

function snapshot(entries: LiveEntry[]): LiveGameSnapshot {
  const players: LiveGameSnapshot['players'] = [
    {
      gameId: 'live1',
      playerId: 'kevin',
      name: 'Kevin',
      isHost: true,
      status: 'active',
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    },
  ];
  const game: LiveGameSnapshot['game'] = {
    id: 'live1',
    status: 'active',
    hostPlayerId: 'kevin',
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

function outboxItem(clientEventId: string, amountCents: number): LiveOutboxItem {
  return {
    clientEventId,
    gameId: 'live1',
    request: {
      kind: 'add_entry',
      body: { playerId: 'kevin', entryType: 'buy_in', amountCents },
    },
    createdAt: now,
    attempts: 1,
    status: 'error', // failed POST awaiting retry — not yet marked synced
    lastError: 'network',
  };
}

describe('projectPending', () => {
  it('replays pending entries the server has not seen', () => {
    const projected = projectPending(snapshot([]), [outboxItem('evt1', 5_000)]);
    const kevin = projected.playerSummaries.find((s) => s.playerId === 'kevin');
    expect(kevin?.buyInCents).toBe(5_000);
  });

  it('does not double-count a pending entry the server already applied', () => {
    // The POST reached the server but the response was lost; a poll snapshot
    // already contains the entry (same clientEventId) while the outbox item
    // still awaits its retry.
    const projected = projectPending(snapshot([entry('evt1', 'kevin', 5_000)]), [
      outboxItem('evt1', 5_000),
    ]);
    const kevin = projected.playerSummaries.find((s) => s.playerId === 'kevin');
    expect(kevin?.buyInCents).toBe(5_000);
    expect(projected.entries).toHaveLength(1);
  });
});
