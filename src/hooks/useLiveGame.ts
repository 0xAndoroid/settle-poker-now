import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchLiveGameRemote,
  finalizeLiveGameRemote,
  type LiveOutboxRequest,
} from '@/lib/liveApiClient';
import { ApiError } from '@/lib/apiClient';
import {
  deriveLiveBankSummary,
  deriveLivePlayerSummaries,
} from '@/lib/liveProjection';
import {
  getCachedLiveSnapshot,
  newClientEventId,
  putCachedLiveSnapshot,
  type LiveOutboxItem,
} from '@/lib/liveStorage';
import type {
  LiveChipCheckpoint,
  LiveEntry,
  LiveGameSnapshot,
  LivePaymentMethod,
  LivePlayer,
  LivePlayerStatus,
  PersistedGameSnapshot,
} from '@/lib/types';
import { useLiveOutbox, type LiveSyncState } from './useLiveOutbox';

export type LiveLoadStatus = 'loading' | 'success' | 'error';

interface LiveGameState {
  status: LiveLoadStatus;
  game: LiveGameSnapshot | null;
  serverGame: LiveGameSnapshot | null;
  error: string | null;
}

interface Options {
  actorLabel?: string | null;
  onError?: (message: string) => void;
}

const POLL_INTERVAL_MS = 4000;
const MUTATION_POLL_GUARD_MS = 3000;
const CHANNEL_NAME = 'settle-live-game';

export function useLiveGame(
  gameId: string,
  options: Options = {}
): {
  state: LiveGameState;
  outboxItems: LiveOutboxItem[];
  pendingCount: number;
  syncState: LiveSyncState;
  refresh: () => Promise<void>;
  addPlayer: (name: string, isHost?: boolean) => Promise<void>;
  updatePlayer: (
    playerId: string,
    patch: { name?: string; status?: LivePlayerStatus; isHost?: boolean }
  ) => Promise<void>;
  addEntry: (body: {
    playerId: string;
    entryType: 'buy_in' | 'cash_out' | 'prior_payment';
    amountCents: number;
    toPlayerId?: string | null;
    paymentMethod?: LivePaymentMethod | null;
    isFinal?: boolean;
    note?: string | null;
  }) => Promise<void>;
  bustedPaidHost: (body: {
    playerId: string;
    amountCents: number;
    toPlayerId?: string | null;
    paymentMethod?: LivePaymentMethod | null;
    note?: string | null;
  }) => Promise<void>;
  voidEntry: (entryId: string, voidReason?: string | null) => Promise<void>;
  addChipCheckpoint: (body: {
    checkpointType: 'set_bank_total' | 'verify_table_count' | 'verify_bank_count';
    amountCents: number;
    note?: string | null;
  }) => Promise<void>;
  finalize: (
    force?: boolean
  ) => Promise<{ game: PersistedGameSnapshot; redirectPath: string } | null>;
} {
  const actorLabel = options.actorLabel ?? null;
  const [state, setState] = useState<LiveGameState>({
    status: 'loading',
    game: null,
    serverGame: null,
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);
  const lastMutationAtRef = useRef(0);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const onErrorRef = useRef(options.onError);
  onErrorRef.current = options.onError;

  const markMutation = useCallback(() => {
    lastMutationAtRef.current = Date.now();
  }, []);

  const publishSnapshot = useCallback((snapshot: LiveGameSnapshot) => {
    channelRef.current?.postMessage({
      type: 'snapshot',
      gameId: snapshot.game.id,
      snapshot,
    });
  }, []);

  const setAuthoritative = useCallback(
    (snapshot: LiveGameSnapshot) => {
      void putCachedLiveSnapshot(snapshot);
      setState((prev) => {
        const projected = projectPending(snapshot, []);
        return {
          status: 'success',
          game: projected,
          serverGame: snapshot,
          error: prev.error,
        };
      });
      publishSnapshot(snapshot);
    },
    [publishSnapshot]
  );

  const { items, pendingCount, syncState, reload, queue, flush } = useLiveOutbox(
    gameId,
    {
      actorLabel,
      onSnapshot: (snapshot) => {
        markMutation();
        setAuthoritative(snapshot);
      },
      onError: (message) => onErrorRef.current?.(message),
      broadcast: () => {
        channelRef.current?.postMessage({ type: 'outbox', gameId });
      },
    }
  );

  useEffect(() => {
    setState({ status: 'loading', game: null, serverGame: null, error: null });
    lastMutationAtRef.current = 0;
    void getCachedLiveSnapshot(gameId).then((cached) => {
      if (cached) {
        setState({
          status: 'success',
          game: cached,
          serverGame: cached,
          error: null,
        });
      }
    });
  }, [gameId]);

  const refresh = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const snapshot = await fetchLiveGameRemote(gameId, ctrl.signal);
      if (Date.now() - lastMutationAtRef.current < MUTATION_POLL_GUARD_MS) {
        return;
      }
      void putCachedLiveSnapshot(snapshot);
      setState({
        status: 'success',
        game: projectPending(snapshot, items),
        serverGame: snapshot,
        error: null,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Unknown error';
      setState((prev) =>
        prev.game
          ? { ...prev, error: message }
          : { status: 'error', game: null, serverGame: null, error: message }
      );
      onErrorRef.current?.(message);
    }
  }, [gameId, items]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setState((prev) => {
      if (!prev.serverGame) return prev;
      return { ...prev, game: projectPending(prev.serverGame, items) };
    });
  }, [items]);

  useEffect(() => {
    const channel =
      typeof BroadcastChannel !== 'undefined'
        ? new BroadcastChannel(CHANNEL_NAME)
        : null;
    channelRef.current = channel;
    if (!channel) return undefined;
    channel.onmessage = (event: MessageEvent) => {
      const data = event.data as
        | { type: 'snapshot'; gameId: string; snapshot: LiveGameSnapshot }
        | { type: 'outbox'; gameId: string };
      if (data.gameId !== gameId) return;
      if (data.type === 'snapshot') {
        void putCachedLiveSnapshot(data.snapshot);
        setState({
          status: 'success',
          game: data.snapshot,
          serverGame: data.snapshot,
          error: null,
        });
      } else {
        void reload().then(() => flush());
      }
    };
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [flush, gameId, reload]);

  useEffect(() => {
    let timer: number | null = null;
    const tick = () => {
      if (document.hidden) return;
      if (Date.now() - lastMutationAtRef.current < MUTATION_POLL_GUARD_MS) return;
      void refresh();
      void flush();
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
        tick();
        start();
      }
    };
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [flush, refresh]);

  const enqueue = useCallback(
    async (request: LiveOutboxRequest) => {
      markMutation();
      await queue(request);
    },
    [markMutation, queue]
  );

  const finalize = useCallback(
    async (force = false) => {
      if (pendingCount > 0) {
        onErrorRef.current?.('Sync pending live changes before finalizing.');
        return null;
      }
      markMutation();
      try {
        return await finalizeLiveGameRemote({
          gameId,
          actorLabel,
          force,
          clientEventId: newClientEventId(),
        });
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Could not finalize live game.';
        onErrorRef.current?.(message);
        return null;
      }
    },
    [actorLabel, gameId, markMutation, pendingCount]
  );

  return useMemo(
    () => ({
      state,
      outboxItems: items,
      pendingCount,
      syncState,
      refresh,
      addPlayer: (name: string, isHost?: boolean) =>
        enqueue({ kind: 'add_player', body: { name, isHost } }),
      updatePlayer: (
        playerId: string,
        patch: { name?: string; status?: LivePlayerStatus; isHost?: boolean }
      ) => enqueue({ kind: 'patch_player', playerId, body: patch }),
      addEntry: (body: {
        playerId: string;
        entryType: 'buy_in' | 'cash_out' | 'prior_payment';
        amountCents: number;
        toPlayerId?: string | null;
        paymentMethod?: LivePaymentMethod | null;
        isFinal?: boolean;
        note?: string | null;
      }) => enqueue({ kind: 'add_entry', body }),
      bustedPaidHost: (body: {
        playerId: string;
        amountCents: number;
        toPlayerId?: string | null;
        paymentMethod?: LivePaymentMethod | null;
        note?: string | null;
      }) => enqueue({ kind: 'busted_paid_host', body }),
      voidEntry: (entryId: string, voidReason?: string | null) =>
        enqueue({ kind: 'void_entry', entryId, body: { voidReason } }),
      addChipCheckpoint: (body: {
        checkpointType:
          | 'set_bank_total'
          | 'verify_table_count'
          | 'verify_bank_count';
        amountCents: number;
        note?: string | null;
      }) => enqueue({ kind: 'chip_checkpoint', body }),
      finalize,
    }),
    [enqueue, finalize, items, pendingCount, refresh, state, syncState]
  );
}

function projectPending(
  snapshot: LiveGameSnapshot,
  items: ReadonlyArray<LiveOutboxItem>
): LiveGameSnapshot {
  const pending = items.filter((item) => item.status !== 'synced');
  if (pending.length === 0) return snapshot;
  const game = { ...snapshot.game };
  const players: LivePlayer[] = snapshot.players.map((player) => ({ ...player }));
  const entries: LiveEntry[] = snapshot.entries.map((entry) => ({ ...entry }));
  const chipCheckpoints: LiveChipCheckpoint[] = snapshot.chipCheckpoints.map(
    (checkpoint) => ({ ...checkpoint })
  );

  for (const item of pending) {
    const createdAt = item.createdAt;
    const request = item.request;
    if (request.kind === 'add_player') {
      const playerId = `pending_${item.clientEventId}`;
      players.push({
        gameId: snapshot.game.id,
        playerId,
        name: request.body.name,
        isHost: request.body.isHost === true,
        status: 'active',
        sortOrder: players.length,
        createdAt,
        updatedAt: createdAt,
      });
      if (request.body.isHost === true) {
        for (const player of players) player.isHost = player.playerId === playerId;
        game.hostPlayerId = playerId;
      }
    } else if (request.kind === 'patch_player') {
      const player = players.find((p) => p.playerId === request.playerId);
      if (player) {
        if (request.body.name !== undefined) player.name = request.body.name;
        if (request.body.status !== undefined) player.status = request.body.status;
        if (request.body.isHost === true) {
          for (const p of players) p.isHost = p.playerId === request.playerId;
          game.hostPlayerId = request.playerId;
        }
      }
    } else if (request.kind === 'add_entry') {
      entries.push(pendingEntry(snapshot.game.id, item, request.body));
    } else if (request.kind === 'busted_paid_host') {
      entries.push(
        pendingEntry(snapshot.game.id, item, {
          playerId: request.body.playerId,
          entryType: 'cash_out',
          amountCents: 0,
          isFinal: true,
        }),
        pendingEntry(
          snapshot.game.id,
          {
            ...item,
            clientEventId: `${item.clientEventId}:payment`,
          },
          {
            playerId: request.body.playerId,
            entryType: 'prior_payment',
            amountCents: request.body.amountCents,
            toPlayerId: request.body.toPlayerId ?? game.hostPlayerId,
            paymentMethod: request.body.paymentMethod ?? null,
          }
        )
      );
    } else if (request.kind === 'void_entry') {
      const entry = entries.find((row) => row.id === request.entryId);
      if (entry) {
        entry.voidedAt = createdAt;
        entry.voidReason = request.body.voidReason ?? null;
      }
    } else {
      if (request.body.checkpointType === 'set_bank_total') {
        game.totalChipBankCents = request.body.amountCents;
      }
      const bank = deriveLiveBankSummary({
        ...snapshot,
        game,
        entries,
        chipCheckpoints,
      });
      const expected =
        request.body.checkpointType === 'set_bank_total'
          ? request.body.amountCents
          : request.body.checkpointType === 'verify_table_count'
            ? bank.chipsInPlayCents
            : bank.expectedBankOnHandCents;
      chipCheckpoints.push({
        id: `pending_${item.clientEventId}`,
        gameId: snapshot.game.id,
        checkpointType: request.body.checkpointType,
        amountCents: request.body.amountCents,
        expectedCents: expected,
        deltaCents: expected === null ? null : request.body.amountCents - expected,
        note: request.body.note ?? null,
        clientEventId: item.clientEventId,
        createdAt,
        createdBy: null,
      });
    }
  }

  const partial = {
    ...snapshot,
    game,
    players,
    entries,
    chipCheckpoints,
  };
  return {
    ...partial,
    playerSummaries: deriveLivePlayerSummaries(partial),
    bankSummary: deriveLiveBankSummary(partial),
  };
}

function pendingEntry(
  gameId: string,
  item: LiveOutboxItem,
  body: {
    playerId: string;
    entryType: 'buy_in' | 'cash_out' | 'prior_payment';
    amountCents: number;
    toPlayerId?: string | null;
    paymentMethod?: LivePaymentMethod | null;
    isFinal?: boolean;
    note?: string | null;
  }
): LiveEntry {
  return {
    id: `pending_${item.clientEventId}`,
    gameId,
    playerId: body.playerId,
    entryType: body.entryType,
    amountCents: body.amountCents,
    toPlayerId: body.toPlayerId ?? null,
    paymentMethod: body.paymentMethod ?? null,
    isFinal: body.isFinal === true,
    note: body.note ?? null,
    clientEventId: item.clientEventId,
    createdAt: item.createdAt,
    createdBy: null,
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
  };
}
