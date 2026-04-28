import { useCallback, useEffect, useState } from 'react';

/**
 * Per-game player identity, stored in localStorage. The user picks "I am
 * Andrew" once and that label flows through every audit log entry on
 * subsequent mutations.
 *
 * Key shape: `spn-identity:<gameId>` → `{ playerId, nickname }`.
 *
 * No login, no auth — this is a friend-game tool. Trust is assumed.
 */

const STORAGE_PREFIX = 'spn-identity:';

export interface GameIdentity {
  playerId: string;
  nickname: string;
}

function key(gameId: string): string {
  return `${STORAGE_PREFIX}${gameId}`;
}

function read(gameId: string): GameIdentity | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key(gameId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { playerId?: unknown; nickname?: unknown };
    if (typeof parsed.playerId !== 'string' || typeof parsed.nickname !== 'string') {
      return null;
    }
    return { playerId: parsed.playerId, nickname: parsed.nickname };
  } catch {
    return null;
  }
}

function write(gameId: string, identity: GameIdentity | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (identity === null) {
      window.localStorage.removeItem(key(gameId));
    } else {
      window.localStorage.setItem(key(gameId), JSON.stringify(identity));
    }
  } catch {
    // ignore quota
  }
}

export function useGameIdentity(gameId: string | null): {
  identity: GameIdentity | null;
  setIdentity: (next: GameIdentity | null) => void;
} {
  const [identity, setIdentityState] = useState<GameIdentity | null>(() =>
    gameId ? read(gameId) : null
  );

  // Re-read whenever the game id flips (rare, but possible if the user
  // navigates from /g/A to /g/B while keeping the SPA mounted).
  useEffect(() => {
    if (gameId === null) {
      setIdentityState(null);
      return;
    }
    setIdentityState(read(gameId));
  }, [gameId]);

  const setIdentity = useCallback(
    (next: GameIdentity | null) => {
      if (gameId === null) return;
      write(gameId, next);
      setIdentityState(next);
    },
    [gameId]
  );

  return { identity, setIdentity };
}
