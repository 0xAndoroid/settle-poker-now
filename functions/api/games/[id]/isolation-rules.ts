/**
 * POST /api/games/:id/isolation-rules
 *
 * Body: { playerId, counterpartId }
 *
 * Creates or updates the isolation rule for `playerId` (one rule per
 * player). The plan is re-derived; cycles are surfaced via the snapshot's
 * `cyclePlayerIds` array (not raised as an error here — the UI flags them).
 */

import { loadGameRow, setIsolation } from '../../../lib/db';
import {
  OPTIONS_NO_CONTENT,
  errorResponse,
  jsonResponse,
  readActorLabel,
} from '../../../lib/responses';

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

interface Body {
  playerId?: string;
  counterpartId?: string;
}

export const onRequestOptions: PagesFunction<Env> = async () => OPTIONS_NO_CONTENT;

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const gameId = (ctx.params.id as string).trim();

  let body: Body;
  try {
    body = (await ctx.request.json()) as Body;
  } catch {
    return errorResponse(400, 'Body must be JSON.');
  }
  if (typeof body.playerId !== 'string' || typeof body.counterpartId !== 'string') {
    return errorResponse(400, 'playerId, counterpartId required.');
  }
  if (body.playerId === body.counterpartId) {
    return errorResponse(400, 'A player cannot be isolated to themselves.');
  }

  const game = await loadGameRow(ctx.env.DB, gameId);
  if (!game) return errorResponse(404, `No game with id "${gameId}".`);

  const updated = await setIsolation(ctx.env.DB, {
    gameId,
    playerId: body.playerId,
    counterpartId: body.counterpartId,
    actorLabel: readActorLabel(ctx.request),
  });
  return jsonResponse({ game: updated }, { status: 201 });
};
