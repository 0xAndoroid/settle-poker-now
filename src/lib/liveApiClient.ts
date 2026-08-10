import { ApiError, readErrorBody } from './apiClient';
import type {
  IsolationRule,
  LiveChipCheckpointType,
  LiveEntryType,
  LiveGameSnapshot,
  LivePaymentMethod,
  LivePlayerStatus,
  PersistedGameSnapshot,
} from './types';

const ACTOR_HEADER = 'X-Actor-Label';
const CLIENT_EVENT_HEADER = 'X-Client-Event-Id';

function headers(args: {
  actorLabel?: string | null;
  clientEventId?: string | null;
  json?: boolean;
}): Record<string, string> {
  const out: Record<string, string> = {};
  if (args.json !== false) out['Content-Type'] = 'application/json';
  if (args.actorLabel) out[ACTOR_HEADER] = args.actorLabel;
  if (args.clientEventId) out[CLIENT_EVENT_HEADER] = args.clientEventId;
  return out;
}

interface LiveGameResponse {
  game: LiveGameSnapshot;
  liveUrl?: string;
}

export interface CreateLiveGameInput {
  hostName?: string | null;
  totalChipBankCents?: number | null;
  title?: string | null;
  note?: string | null;
  actorLabel?: string | null;
  clientEventId?: string | null;
}

export async function createLiveGameRemote(
  input: CreateLiveGameInput,
  signal?: AbortSignal
): Promise<{ game: LiveGameSnapshot; liveUrl: string | null }> {
  const res = await fetch('/api/live-games', {
    method: 'POST',
    signal,
    headers: headers({
      actorLabel: input.actorLabel ?? null,
      clientEventId: input.clientEventId ?? null,
    }),
    body: JSON.stringify({
      hostName: input.hostName ?? null,
      totalChipBankCents: input.totalChipBankCents ?? null,
      title: input.title ?? null,
      note: input.note ?? null,
      clientEventId: input.clientEventId ?? null,
    }),
  });
  if (!res.ok) throw new ApiError(res.status, await readErrorBody(res));
  const json = (await res.json()) as LiveGameResponse;
  return { game: json.game, liveUrl: json.liveUrl ?? null };
}

export async function fetchLiveGameRemote(
  gameId: string,
  signal?: AbortSignal
): Promise<LiveGameSnapshot> {
  const res = await fetch(`/api/live-games/${encodeURIComponent(gameId)}`, {
    method: 'GET',
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new ApiError(res.status, await readErrorBody(res));
  return ((await res.json()) as LiveGameResponse).game;
}

export async function deleteLiveGameRemote(
  gameId: string,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`/api/live-games/${encodeURIComponent(gameId)}`, {
    method: 'DELETE',
    signal,
  });
  if (!res.ok) throw new ApiError(res.status, await readErrorBody(res));
}

export type LiveOutboxRequest =
  | {
      kind: 'add_player';
      body: { name: string; isHost?: boolean };
    }
  | {
      kind: 'patch_player';
      playerId: string;
      body: { name?: string; status?: LivePlayerStatus; isHost?: boolean };
    }
  | {
      kind: 'add_entry';
      body: {
        playerId: string;
        entryType: LiveEntryType;
        amountCents: number;
        toPlayerId?: string | null;
        paymentMethod?: LivePaymentMethod | null;
        isFinal?: boolean;
        note?: string | null;
      };
    }
  | {
      kind: 'busted_paid_host';
      body: {
        playerId: string;
        amountCents: number;
        toPlayerId?: string | null;
        paymentMethod?: LivePaymentMethod | null;
        note?: string | null;
      };
    }
  | {
      kind: 'void_entry';
      entryId: string;
      body: { voidReason?: string | null };
    }
  | {
      kind: 'chip_checkpoint';
      body: {
        checkpointType: LiveChipCheckpointType;
        amountCents: number;
        note?: string | null;
      };
    };

export async function sendLiveOutboxRequest(
  args: {
    gameId: string;
    clientEventId: string;
    actorLabel: string | null;
    request: LiveOutboxRequest;
  },
  signal?: AbortSignal
): Promise<LiveGameSnapshot> {
  const base = `/api/live-games/${encodeURIComponent(args.gameId)}`;
  const common = {
    clientEventId: args.clientEventId,
    actorLabel: args.actorLabel,
  };

  let res: Response;
  if (args.request.kind === 'add_player') {
    res = await fetch(`${base}/players`, {
      method: 'POST',
      signal,
      headers: headers(common),
      body: JSON.stringify({ ...args.request.body, clientEventId: args.clientEventId }),
    });
  } else if (args.request.kind === 'patch_player') {
    res = await fetch(`${base}/players/${encodeURIComponent(args.request.playerId)}`, {
      method: 'PATCH',
      signal,
      headers: headers(common),
      body: JSON.stringify({ ...args.request.body, clientEventId: args.clientEventId }),
    });
  } else if (args.request.kind === 'add_entry') {
    res = await fetch(`${base}/entries`, {
      method: 'POST',
      signal,
      headers: headers(common),
      body: JSON.stringify({ ...args.request.body, clientEventId: args.clientEventId }),
    });
  } else if (args.request.kind === 'busted_paid_host') {
    res = await fetch(`${base}/entries`, {
      method: 'POST',
      signal,
      headers: headers(common),
      body: JSON.stringify({
        action: 'busted_paid_host',
        ...args.request.body,
        clientEventId: args.clientEventId,
      }),
    });
  } else if (args.request.kind === 'void_entry') {
    res = await fetch(`${base}/entries/${encodeURIComponent(args.request.entryId)}`, {
      method: 'DELETE',
      signal,
      headers: headers(common),
      body: JSON.stringify({ ...args.request.body, clientEventId: args.clientEventId }),
    });
  } else {
    res = await fetch(`${base}/chip-checkpoints`, {
      method: 'POST',
      signal,
      headers: headers(common),
      body: JSON.stringify({ ...args.request.body, clientEventId: args.clientEventId }),
    });
  }

  if (!res.ok) throw new ApiError(res.status, await readErrorBody(res));
  return ((await res.json()) as LiveGameResponse).game;
}

export async function finalizeLiveGameRemote(
  args: {
    gameId: string;
    clientEventId: string;
    actorLabel: string | null;
    force?: boolean;
    roundToDollars?: boolean;
    isolations?: ReadonlyArray<IsolationRule>;
  },
  signal?: AbortSignal
): Promise<{ game: PersistedGameSnapshot; redirectPath: string }> {
  const res = await fetch(`/api/live-games/${encodeURIComponent(args.gameId)}/finalize`, {
    method: 'POST',
    signal,
    headers: headers({
      actorLabel: args.actorLabel,
      clientEventId: args.clientEventId,
    }),
    body: JSON.stringify({
      clientEventId: args.clientEventId,
      actorLabel: args.actorLabel,
      force: args.force === true,
      roundToDollars: args.roundToDollars !== false,
      isolations: (args.isolations ?? []).map((rule) => ({
        playerId: rule.playerId,
        counterpartId: rule.counterpartId,
      })),
    }),
  });
  if (!res.ok) throw new ApiError(res.status, await readErrorBody(res));
  return (await res.json()) as { game: PersistedGameSnapshot; redirectPath: string };
}
