import { describe, expect, it } from 'vitest';
import {
  markRecentGameMissing,
  readRecentGames,
  removeRecentGame,
  upsertRecentGame,
  type RecentGameEntry,
} from './recentGames';

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const baseEntry = {
  kind: 'ledger',
  id: 'abc123',
  path: '/#ledger',
  label: 'Jun 11 · 6 players · $1,200 buy-in',
  status: 'inactive',
} satisfies Omit<RecentGameEntry, 'lastVisitedAt'>;

describe('recentGames storage', () => {
  it('returns an empty list for corrupted localStorage data', () => {
    const storage = new MemoryStorage();
    storage.setItem('settle-poker-now:recent-games:v1', '{not json');

    expect(readRecentGames(storage)).toEqual([]);
  });

  it('deduplicates by kind/id and keeps most recent visits first', () => {
    const storage = new MemoryStorage();

    upsertRecentGame(storage, { ...baseEntry, lastVisitedAt: 100 });
    upsertRecentGame(storage, {
      kind: 'live',
      id: 'live123',
      path: '/live/live123',
      label: 'Jun 12 · 3 players · $300 in play',
      status: 'active',
      lastVisitedAt: 200,
    });
    upsertRecentGame(storage, {
      ...baseEntry,
      label: 'Jun 11 · 7 players · $1,400 buy-in',
      status: 'finalized',
      lastVisitedAt: 300,
    });

    expect(readRecentGames(storage)).toEqual([
      {
        kind: 'ledger',
        id: 'abc123',
        path: '/#ledger',
        label: 'Jun 11 · 7 players · $1,400 buy-in',
        status: 'finalized',
        lastVisitedAt: 300,
      },
      {
        kind: 'live',
        id: 'live123',
        path: '/live/live123',
        label: 'Jun 12 · 3 players · $300 in play',
        status: 'active',
        lastVisitedAt: 200,
      },
    ]);
  });

  it('caps history to 50 entries and evicts the oldest visit', () => {
    const storage = new MemoryStorage();

    for (let i = 0; i < 52; i++) {
      upsertRecentGame(storage, {
        kind: 'game',
        id: `game${i}`,
        path: `/g/game${i}`,
        label: `Game ${i}`,
        status: 'finalized',
        lastVisitedAt: i,
      });
    }

    const entries = readRecentGames(storage);
    expect(entries).toHaveLength(50);
    expect(entries[0]?.id).toBe('game51');
    expect(entries.at(-1)?.id).toBe('game2');
    expect(entries.some((entry) => entry.id === 'game0')).toBe(false);
    expect(entries.some((entry) => entry.id === 'game1')).toBe(false);
  });

  it('removes one entry without touching other kinds that share the id', () => {
    const storage = new MemoryStorage();
    upsertRecentGame(storage, { ...baseEntry, lastVisitedAt: 100 });
    upsertRecentGame(storage, {
      kind: 'live',
      id: 'abc123',
      path: '/live/abc123',
      label: 'Live table',
      status: 'active',
      lastVisitedAt: 200,
    });

    removeRecentGame(storage, 'ledger', 'abc123');

    expect(readRecentGames(storage)).toEqual([
      {
        kind: 'live',
        id: 'abc123',
        path: '/live/abc123',
        label: 'Live table',
        status: 'active',
        lastVisitedAt: 200,
      },
    ]);
  });

  it('marks an existing entry missing without changing its status', () => {
    const storage = new MemoryStorage();
    upsertRecentGame(storage, { ...baseEntry, lastVisitedAt: 100 });

    markRecentGameMissing(storage, 'ledger', 'abc123', 500);

    expect(readRecentGames(storage)).toEqual([
      {
        ...baseEntry,
        lastVisitedAt: 100,
        missingAt: 500,
      },
    ]);
  });
});
