/**
 * Thin client for the persistent-game routes.
 *
 * Every method passes the user's chosen actor label (a player nickname,
 * stored in localStorage per-game) via the `X-Actor-Label` header so the
 * server records audit trail entries.
 */

import type { PersistedGameSnapshot } from './types';

const ACTOR_HEADER = 'X-Actor-Label';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function readErrorBody(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as { error?: string };
    if (typeof json.error === 'string') return json.error;
  } catch {
    // not JSON — fall through
  }
  try {
    return await res.text();
  } catch {
    return res.statusText;
  }
}

function actorHeaders(actorLabel: string | null): Record<string, string> {
  if (!actorLabel) return {};
  return { [ACTOR_HEADER]: actorLabel };
}

interface GameResponse {
  game: PersistedGameSnapshot;
  id?: string;
}

export interface CreateGameInput {
  pokernowUrl: string;
  actorLabel?: string | null;
}

export async function createPersistentGame(
  input: CreateGameInput,
  signal?: AbortSignal
): Promise<PersistedGameSnapshot> {
  const res = await fetch('/api/games', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      ...actorHeaders(input.actorLabel ?? null),
    },
    body: JSON.stringify({
      pokernowUrl: input.pokernowUrl,
      actorLabel: input.actorLabel ?? null,
    }),
  });
  if (!res.ok) throw new ApiError(res.status, await readErrorBody(res));
  const json = (await res.json()) as GameResponse;
  return json.game;
}

export async function fetchPersistentGame(
  id: string,
  signal?: AbortSignal
): Promise<PersistedGameSnapshot> {
  const res = await fetch(`/api/games/${encodeURIComponent(id)}`, {
    method: 'GET',
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new ApiError(res.status, await readErrorBody(res));
  const json = (await res.json()) as GameResponse;
  return json.game;
}

export async function setPaymentCompleted(
  args: {
    gameId: string;
    paymentId: string;
    completed: boolean;
    actorLabel: string | null;
  },
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(
    `/api/games/${encodeURIComponent(args.gameId)}/payments/${encodeURIComponent(args.paymentId)}`,
    {
      method: 'PATCH',
      signal,
      headers: {
        'Content-Type': 'application/json',
        ...actorHeaders(args.actorLabel),
      },
      body: JSON.stringify({ completed: args.completed }),
    }
  );
  if (!res.ok) throw new ApiError(res.status, await readErrorBody(res));
}

export async function addAdjustmentRemote(
  args: {
    gameId: string;
    fromPlayerId: string;
    toPlayerId: string;
    amountCents: number;
    actorLabel: string | null;
  },
  signal?: AbortSignal
): Promise<PersistedGameSnapshot> {
  const res = await fetch(
    `/api/games/${encodeURIComponent(args.gameId)}/adjustments`,
    {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        ...actorHeaders(args.actorLabel),
      },
      body: JSON.stringify({
        fromPlayerId: args.fromPlayerId,
        toPlayerId: args.toPlayerId,
        amountCents: args.amountCents,
      }),
    }
  );
  if (!res.ok) throw new ApiError(res.status, await readErrorBody(res));
  return ((await res.json()) as GameResponse).game;
}

export async function removeAdjustmentRemote(
  args: { gameId: string; adjustmentId: string; actorLabel: string | null },
  signal?: AbortSignal
): Promise<PersistedGameSnapshot> {
  const res = await fetch(
    `/api/games/${encodeURIComponent(args.gameId)}/adjustments/${encodeURIComponent(args.adjustmentId)}`,
    {
      method: 'DELETE',
      signal,
      headers: actorHeaders(args.actorLabel),
    }
  );
  if (!res.ok) throw new ApiError(res.status, await readErrorBody(res));
  return ((await res.json()) as GameResponse).game;
}

export async function setIsolationRemote(
  args: {
    gameId: string;
    playerId: string;
    counterpartId: string;
    actorLabel: string | null;
  },
  signal?: AbortSignal
): Promise<PersistedGameSnapshot> {
  const res = await fetch(
    `/api/games/${encodeURIComponent(args.gameId)}/isolation-rules`,
    {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        ...actorHeaders(args.actorLabel),
      },
      body: JSON.stringify({
        playerId: args.playerId,
        counterpartId: args.counterpartId,
      }),
    }
  );
  if (!res.ok) throw new ApiError(res.status, await readErrorBody(res));
  return ((await res.json()) as GameResponse).game;
}

export async function clearIsolationRemote(
  args: { gameId: string; playerId: string; actorLabel: string | null },
  signal?: AbortSignal
): Promise<PersistedGameSnapshot> {
  const res = await fetch(
    `/api/games/${encodeURIComponent(args.gameId)}/isolation-rules/${encodeURIComponent(args.playerId)}`,
    {
      method: 'DELETE',
      signal,
      headers: actorHeaders(args.actorLabel),
    }
  );
  if (!res.ok) throw new ApiError(res.status, await readErrorBody(res));
  return ((await res.json()) as GameResponse).game;
}
