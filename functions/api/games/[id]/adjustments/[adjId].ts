/**
 * DELETE /api/games/:id/adjustments/:adjId
 *
 * Removes an adjustment and re-derives the settlement plan.
 */

import { loadGameRow, removeAdjustment } from '../../../../lib/db';
import {
  OPTIONS_NO_CONTENT,
  errorResponse,
  jsonResponse,
  mapMutationError,
  readActorLabel,
} from '../../../../lib/responses';

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

export const onRequestOptions: PagesFunction<Env> = async () => OPTIONS_NO_CONTENT;

export const onRequestDelete: PagesFunction<Env> = async (ctx) => {
  const gameId = (ctx.params.id as string).trim();
  const adjId = (ctx.params.adjId as string).trim();
  if (!gameId || !adjId) {
    return errorResponse(400, 'Missing game id or adjustment id.');
  }

  const game = await loadGameRow(ctx.env.DB, gameId);
  if (!game) return errorResponse(404, `No game with id "${gameId}".`);

  try {
    const updated = await removeAdjustment(ctx.env.DB, {
      gameId,
      adjustmentId: adjId,
      actorLabel: readActorLabel(ctx.request),
    });
    return jsonResponse({ game: updated });
  } catch (err) {
    const mapped = mapMutationError(err);
    if (mapped) return mapped;
    throw err;
  }
};
