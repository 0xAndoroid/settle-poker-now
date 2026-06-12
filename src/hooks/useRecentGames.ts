import { useCallback, useEffect, useState } from 'react';
import {
  getRecentGamesStorage,
  readRecentGames,
  RECENT_GAMES_STORAGE_KEY,
  RECENT_GAMES_UPDATED_EVENT,
  removeRecentGame,
  type RecentGameEntry,
  type RecentGameKind,
} from '@/lib/recentGames';

export function useRecentGames(): {
  entries: RecentGameEntry[];
  remove: (kind: RecentGameKind, id: string) => void;
} {
  const [entries, setEntries] = useState<RecentGameEntry[]>(() =>
    readRecentGames(getRecentGamesStorage())
  );

  const refresh = useCallback(() => {
    setEntries(readRecentGames(getRecentGamesStorage()));
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === RECENT_GAMES_STORAGE_KEY || event.key === null) refresh();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(RECENT_GAMES_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(RECENT_GAMES_UPDATED_EVENT, refresh);
    };
  }, [refresh]);

  const remove = useCallback((kind: RecentGameKind, id: string) => {
    setEntries(removeRecentGame(getRecentGamesStorage(), kind, id));
  }, []);

  return { entries, remove };
}
