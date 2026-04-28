/**
 * DELETE /api/games/:id/isolation-rules/:playerId
 *
 * Removes the isolation rule for the given player and re-derives the
 * settlement plan.
 */

import { clearIsolation, loadGameRow } from '../../../../lib/db';
import {
  OPTIONS_NO_CONTENT,
  errorResponse,
  jsonResponse,
  readActorLabel,
} from '../../../../lib/responses';

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

export const onRequestOptions: PagesFunction<Env> = async () => OPTIONS_NO_CONTENT;

export const onRequestDelete: PagesFunction<Env> = async (ctx) => {
  const gameId = (ctx.params.id as string).trim();
  const playerId = (ctx.params.playerId as string).trim();
  if (!gameId || !playerId) {
    return errorResponse(400, 'Missing game id or player id.');
  }

  const game = await loadGameRow(ctx.env.DB, gameId);
  if (!game) return errorResponse(404, `No game with id "${gameId}".`);

  const updated = await clearIsolation(ctx.env.DB, {
    gameId,
    playerId,
    actorLabel: readActorLabel(ctx.request),
  });
  return jsonResponse({ game: updated });
};
