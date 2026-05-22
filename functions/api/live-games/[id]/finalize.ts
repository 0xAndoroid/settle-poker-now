/**
 * POST /api/live-games/:id/finalize
 *
 * Finalizes a live game into the existing persistent /g/:id settlement.
 */

import {
  LiveConflictError,
  LiveNotFoundError,
  finalizeLiveGame,
} from '../../../lib/live-db';
import {
  OPTIONS_NO_CONTENT,
  errorResponse,
  jsonResponse,
  mapMutationError,
  readActorLabel,
  readClientEventId,
} from '../../../lib/responses';

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

interface Body {
  clientEventId?: string;
  actorLabel?: string | null;
  force?: boolean;
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
  const clientEventId = readClientEventId(ctx.request, body);
  if (!clientEventId) return errorResponse(400, 'clientEventId is required.');

  try {
    const actorLabel =
      typeof body.actorLabel === 'string'
        ? body.actorLabel.trim().slice(0, 64) || null
        : readActorLabel(ctx.request);
    const result = await finalizeLiveGame(ctx.env.DB, {
      gameId,
      clientEventId,
      actorLabel,
      force: body.force === true,
    });
    return jsonResponse(result);
  } catch (err) {
    if (err instanceof LiveNotFoundError) return errorResponse(404, err.message);
    if (err instanceof LiveConflictError) return errorResponse(409, err.message);
    const mapped = mapMutationError(err);
    if (mapped) return mapped;
    throw err;
  }
};
