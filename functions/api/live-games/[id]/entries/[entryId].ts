/**
 * DELETE /api/live-games/:id/entries/:entryId
 *
 * Voids an entry instead of deleting it.
 */

import { LiveNotFoundError, voidLiveEntry } from '../../../../lib/live-db';
import {
  OPTIONS_NO_CONTENT,
  errorResponse,
  jsonResponse,
  mapMutationError,
  readActorLabel,
  readClientEventId,
} from '../../../../lib/responses';

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

interface Body {
  clientEventId?: string;
  voidReason?: string | null;
}

export const onRequestOptions: PagesFunction<Env> = async () => OPTIONS_NO_CONTENT;

export const onRequestDelete: PagesFunction<Env> = async (ctx) => {
  const gameId = (ctx.params.id as string).trim();
  const entryId = (ctx.params.entryId as string).trim();
  let body: Body = {};
  try {
    body = (await ctx.request.json()) as Body;
  } catch {
    body = {};
  }
  const clientEventId = readClientEventId(ctx.request, body);
  if (!clientEventId) return errorResponse(400, 'clientEventId is required.');

  try {
    const snapshot = await voidLiveEntry(ctx.env.DB, {
      gameId,
      entryId,
      clientEventId,
      actorLabel: readActorLabel(ctx.request),
      voidReason: typeof body.voidReason === 'string' ? body.voidReason : null,
    });
    return jsonResponse({ game: snapshot });
  } catch (err) {
    if (err instanceof LiveNotFoundError) return errorResponse(404, err.message);
    const mapped = mapMutationError(err);
    if (mapped) return mapped;
    throw err;
  }
};
