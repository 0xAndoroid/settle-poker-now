import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  addAdjustmentRemote,
  addAliasRemote,
  clearIsolationRemote,
  fetchPersistentGame,
  removeAdjustmentRemote,
  removeAliasRemote,
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
 * Polling pauses for this long after every mutation. Closes the race
 * window where a poll fires between the optimistic UI flip and the PATCH
 * commit, then overwrites the UI with stale D1 state.
 */
const MUTATION_POLL_GUARD_MS = 4000;

interface UsePersistentGameOptions {
  /**
   * Called whenever a mutation fails. Lets the caller surface a toast.
   * The optimistic UI update is reverted automatically before this fires.
   */
  onError?: (message: string) => void;
}

/**
 * Owns the lifecycle of a persistent game view.
 *
 * Race-safety contract:
 *   1. PATCH/POST/DELETE responses always carry the full updated snapshot;
 *      we replace local state with that response — never with a follow-up
 *      poll fetch.
 *   2. After any mutation, we set `lastMutationAt = now`. The polling
 *      tick refuses to fire while `now - lastMutationAt < MUTATION_POLL_GUARD_MS`.
 *      This guards against in-flight polls (started before the mutation)
 *      from clobbering the authoritative response.
 *   3. Failed mutations revert the optimistic update from the snapshot we
 *      took before applying it; `onError` is fired so the caller can toast.
 */
export function usePersistentGame(
  gameId: string,
  actorLabel: string | null,
  options: UsePersistentGameOptions = {}
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
  addAlias: (input: { playerId: string; aliasToPlayerId: string }) => Promise<void>;
  removeAlias: (playerId: string) => Promise<void>;
} {
  const [state, setState] = useState<PersistentGameState>({
    status: 'loading',
    game: null,
    error: null,
  });

  const abortRef = useRef<AbortController | null>(null);
  const lastMutationAtRef = useRef<number>(0);
  const onErrorRef = useRef(options.onError);
  onErrorRef.current = options.onError;

  const markMutation = useCallback(() => {
    lastMutationAtRef.current = Date.now();
  }, []);

  const refresh = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const game = await fetchPersistentGame(gameId, ctrl.signal);
      // Drop the response if a mutation completed mid-flight — it owns the
      // authoritative state.
      if (Date.now() - lastMutationAtRef.current < MUTATION_POLL_GUARD_MS) {
        return;
      }
      setState({ status: 'success', game, error: null });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Unknown error';
      setState((prev) =>
        // Don't tear down a successfully-loaded view on a transient
        // poll error; surface it via toast and keep the last good state.
        prev.game
          ? { status: 'success', game: prev.game, error: message }
          : { status: 'error', game: null, error: message }
      );
      onErrorRef.current?.(message);
    }
  }, [gameId]);

  // Initial fetch.
  useEffect(() => {
    setState({ status: 'loading', game: null, error: null });
    lastMutationAtRef.current = 0;
    refresh();
  }, [refresh]);

  // Poll while visible — but skip ticks that fire too close to a mutation.
  useEffect(() => {
    let timer: number | null = null;
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (Date.now() - lastMutationAtRef.current < MUTATION_POLL_GUARD_MS) {
        return;
      }
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
        // Fresh load on regain — but skip if we just mutated.
        if (Date.now() - lastMutationAtRef.current >= MUTATION_POLL_GUARD_MS) {
          refresh();
        }
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

  const reportError = useCallback((err: unknown) => {
    const message =
      err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Unknown error';
    onErrorRef.current?.(message);
    return message;
  }, []);

  /* ────── Mutations ────── */

  const togglePayment = useCallback(
    async (paymentId: string, completed: boolean) => {
      // Capture the pre-mutation snapshot for revert-on-failure.
      let priorGame: PersistedGameSnapshot | null = null;
      setState((prev) => {
        if (!prev.game) return prev;
        priorGame = prev.game;
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
      markMutation();
      try {
        const game = await setPaymentCompleted({
          gameId,
          paymentId,
          completed,
          actorLabel,
        });
        // Authoritative snapshot replaces optimistic state. Bump the
        // mutation timestamp again so any poll currently in-flight that
        // resolves AFTER this server response is still ignored.
        markMutation();
        setState({ status: 'success', game, error: null });
      } catch (err) {
        // Revert and surface.
        if (priorGame) {
          const reverted = priorGame;
          setState((prev) => ({ ...prev, game: reverted, error: null }));
        }
        reportError(err);
      }
    },
    [actorLabel, gameId, markMutation, reportError]
  );

  const runMutation = useCallback(
    async (mutation: () => Promise<PersistedGameSnapshot>): Promise<void> => {
      markMutation();
      try {
        const game = await mutation();
        markMutation();
        setState({ status: 'success', game, error: null });
      } catch (err) {
        reportError(err);
      }
    },
    [markMutation, reportError]
  );

  const addAdjustment = useCallback(
    (input: { fromPlayerId: string; toPlayerId: string; amountCents: number }) =>
      runMutation(() =>
        addAdjustmentRemote({ gameId, ...input, actorLabel })
      ),
    [actorLabel, gameId, runMutation]
  );

  const removeAdjustment = useCallback(
    (adjustmentId: string) =>
      runMutation(() =>
        removeAdjustmentRemote({ gameId, adjustmentId, actorLabel })
      ),
    [actorLabel, gameId, runMutation]
  );

  const setIsolation = useCallback(
    (input: { playerId: string; counterpartId: string }) =>
      runMutation(() => setIsolationRemote({ gameId, ...input, actorLabel })),
    [actorLabel, gameId, runMutation]
  );

  const clearIsolation = useCallback(
    (playerId: string) =>
      runMutation(() =>
        clearIsolationRemote({ gameId, playerId, actorLabel })
      ),
    [actorLabel, gameId, runMutation]
  );

  const addAlias = useCallback(
    (input: { playerId: string; aliasToPlayerId: string }) =>
      runMutation(() => addAliasRemote({ gameId, ...input, actorLabel })),
    [actorLabel, gameId, runMutation]
  );

  const removeAlias = useCallback(
    (playerId: string) =>
      runMutation(() => removeAliasRemote({ gameId, playerId, actorLabel })),
    [actorLabel, gameId, runMutation]
  );

  return {
    state,
    refresh,
    togglePayment,
    addAdjustment,
    removeAdjustment,
    setIsolation,
    clearIsolation,
    addAlias,
    removeAlias,
  };
}

/** Exposed for tests so they can simulate the guard window. */
export const __MUTATION_POLL_GUARD_MS = MUTATION_POLL_GUARD_MS;
