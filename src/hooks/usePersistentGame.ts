import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  addAdjustmentRemote,
  clearIsolationRemote,
  fetchPersistentGame,
  removeAdjustmentRemote,
  setIsolationRemote,
  setPaymentCompleted,
} from '@/lib/apiClient';
import type { PersistedGameSnapshot } from '@/lib/types';

export type LoadStatus = 'loading' | 'success' | 'error';

interface PersistentGameState {
  status: LoadStatus;
  game: PersistedGameSnapshot | null;
  error: string | null;
}

const POLL_INTERVAL_MS = 8000;

/**
 * Owns the lifecycle of a persistent game view. Fetches once on mount,
 * polls every 8 s while the document is visible, and exposes optimistic
 * mutation helpers that re-sync the snapshot from the server on
 * resolution.
 */
export function usePersistentGame(
  gameId: string,
  actorLabel: string | null
): {
  state: PersistentGameState;
  refresh: () => Promise<void>;
  togglePayment: (paymentId: string, completed: boolean) => Promise<void>;
  addAdjustment: (input: {
    fromPlayerId: string;
    toPlayerId: string;
    amountCents: number;
  }) => Promise<void>;
  removeAdjustment: (adjustmentId: string) => Promise<void>;
  setIsolation: (input: { playerId: string; counterpartId: string }) => Promise<void>;
  clearIsolation: (playerId: string) => Promise<void>;
} {
  const [state, setState] = useState<PersistentGameState>({
    status: 'loading',
    game: null,
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const game = await fetchPersistentGame(gameId, ctrl.signal);
      setState({ status: 'success', game, error: null });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Unknown error';
      setState({ status: 'error', game: null, error: message });
    }
  }, [gameId]);

  // Initial fetch.
  useEffect(() => {
    setState({ status: 'loading', game: null, error: null });
    refresh();
  }, [refresh]);

  // Poll while visible.
  useEffect(() => {
    let timer: number | null = null;
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      refresh();
    };
    const start = () => {
      if (timer !== null) return;
      timer = window.setInterval(tick, POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        // Refresh immediately on regain so the user sees the latest state.
        refresh();
        start();
      }
    };
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  // Mutation helpers — apply server side, then re-sync from the response.
  const togglePayment = useCallback(
    async (paymentId: string, completed: boolean) => {
      // Optimistic update.
      setState((prev) => {
        if (!prev.game) return prev;
        return {
          ...prev,
          game: {
            ...prev.game,
            payments: prev.game.payments.map((p) =>
              p.id === paymentId
                ? {
                    ...p,
                    completedAt: completed ? Date.now() : null,
                    completedBy: completed ? actorLabel : null,
                  }
                : p
            ),
          },
        };
      });
      try {
        await setPaymentCompleted({
          gameId,
          paymentId,
          completed,
          actorLabel,
        });
      } finally {
        await refresh();
      }
    },
    [actorLabel, gameId, refresh]
  );

  const addAdjustment = useCallback(
    async (input: {
      fromPlayerId: string;
      toPlayerId: string;
      amountCents: number;
    }) => {
      const game = await addAdjustmentRemote({
        gameId,
        ...input,
        actorLabel,
      });
      setState({ status: 'success', game, error: null });
    },
    [actorLabel, gameId]
  );

  const removeAdjustment = useCallback(
    async (adjustmentId: string) => {
      const game = await removeAdjustmentRemote({
        gameId,
        adjustmentId,
        actorLabel,
      });
      setState({ status: 'success', game, error: null });
    },
    [actorLabel, gameId]
  );

  const setIsolation = useCallback(
    async (input: { playerId: string; counterpartId: string }) => {
      const game = await setIsolationRemote({
        gameId,
        ...input,
        actorLabel,
      });
      setState({ status: 'success', game, error: null });
    },
    [actorLabel, gameId]
  );

  const clearIsolation = useCallback(
    async (playerId: string) => {
      const game = await clearIsolationRemote({ gameId, playerId, actorLabel });
      setState({ status: 'success', game, error: null });
    },
    [actorLabel, gameId]
  );

  return {
    state,
    refresh,
    togglePayment,
    addAdjustment,
    removeAdjustment,
    setIsolation,
    clearIsolation,
  };
}
