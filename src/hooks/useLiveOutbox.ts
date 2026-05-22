import { useCallback, useEffect, useRef, useState } from 'react';
import {
  sendLiveOutboxRequest,
  type LiveOutboxRequest,
} from '@/lib/liveApiClient';
import {
  listLiveOutboxItems,
  newClientEventId,
  putLiveOutboxItem,
  updateLiveOutboxItem,
  type LiveOutboxItem,
} from '@/lib/liveStorage';
import type { LiveGameSnapshot } from '@/lib/types';

export type LiveSyncState = 'online' | 'syncing' | 'offline' | 'unsynced' | 'error';

interface Options {
  actorLabel: string | null;
  onSnapshot: (snapshot: LiveGameSnapshot) => void;
  onError?: (message: string) => void;
  broadcast?: () => void;
}

export function useLiveOutbox(
  gameId: string,
  options: Options
): {
  items: LiveOutboxItem[];
  pendingCount: number;
  syncState: LiveSyncState;
  reload: () => Promise<void>;
  queue: (request: LiveOutboxRequest) => Promise<string>;
  flush: () => Promise<void>;
} {
  const [items, setItems] = useState<LiveOutboxItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const flushingRef = useRef(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const reload = useCallback(async () => {
    const rows = await listLiveOutboxItems(gameId);
    setItems(rows);
  }, [gameId]);

  const flush = useCallback(async () => {
    if (flushingRef.current) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setLastError('offline');
      return;
    }
    flushingRef.current = true;
    setSyncing(true);
    setLastError(null);
    try {
      const rows = await listLiveOutboxItems(gameId);
      setItems(rows);
      const pending = rows.filter((item) => item.status !== 'synced');
      for (const item of pending) {
        await updateLiveOutboxItem(item.clientEventId, {
          status: 'syncing',
          attempts: item.attempts + 1,
          lastError: null,
        });
        await reload();
        try {
          const snapshot = await sendLiveOutboxRequest({
            gameId,
            clientEventId: item.clientEventId,
            actorLabel: optionsRef.current.actorLabel,
            request: item.request,
          });
          await updateLiveOutboxItem(item.clientEventId, {
            status: 'synced',
            lastError: null,
          });
          optionsRef.current.onSnapshot(snapshot);
          optionsRef.current.broadcast?.();
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Sync failed.';
          await updateLiveOutboxItem(item.clientEventId, {
            status: 'error',
            lastError: message,
          });
          setLastError(message);
          optionsRef.current.onError?.(message);
          break;
        } finally {
          await reload();
        }
      }
    } finally {
      flushingRef.current = false;
      setSyncing(false);
    }
  }, [gameId, reload]);

  const queue = useCallback(
    async (request: LiveOutboxRequest) => {
      const clientEventId = newClientEventId();
      const item: LiveOutboxItem = {
        clientEventId,
        gameId,
        request,
        createdAt: Date.now(),
        attempts: 0,
        status: 'pending',
        lastError: null,
      };
      await putLiveOutboxItem(item);
      await reload();
      optionsRef.current.broadcast?.();
      void flush();
      return clientEventId;
    },
    [flush, gameId, reload]
  );

  useEffect(() => {
    void reload().then(() => {
      void flush();
    });
  }, [flush, reload]);

  useEffect(() => {
    const onOnline = () => {
      void flush();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [flush]);

  const pendingCount = items.filter((item) => item.status !== 'synced').length;
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const syncState: LiveSyncState = offline
    ? 'offline'
    : syncing
      ? 'syncing'
      : lastError
        ? 'error'
        : pendingCount > 0
          ? 'unsynced'
          : 'online';

  return { items, pendingCount, syncState, reload, queue, flush };
}
