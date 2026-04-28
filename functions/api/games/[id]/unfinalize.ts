/**
 * POST /api/games/:id/unfinalize
 *
 * Reverses the lock. Idempotent — unfinalizing a not-finalized game
 * returns 200. Audit trail records who unlocked + when. Allowed by
 * design: the friend trust model means anyone can fix mistakes.
 *
 * Header: X-Actor-Label (optional, audit only).
 */

import { loadGameRow, unfinalizeGame } from '../../../lib/db';
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

export const onRequestOptions: PagesFunction<Env> = async () => OPTIONS_NO_CONTENT;

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const gameId = (ctx.params.id as string).trim();
  if (!gameId) return errorResponse(400, 'Missing game id.');

  const game = await loadGameRow(ctx.env.DB, gameId);
  if (!game) return errorResponse(404, `No game with id "${gameId}".`);

  const updated = await unfinalizeGame(ctx.env.DB, {
    gameId,
    actorLabel: readActorLabel(ctx.request),
  });
  return jsonResponse({ game: updated }, { status: 200 });
};
