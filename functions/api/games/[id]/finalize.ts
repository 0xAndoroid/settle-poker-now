/**
 * POST /api/games/:id/finalize
 *
 * Locks a game. Idempotent — re-finalizing returns 200 with the
 * current snapshot. Audit trail records who locked + when.
 *
 * Header: X-Actor-Label (optional, audit only).
 */

import { finalizeGame, loadGameRow } from '../../../lib/db';
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

  const updated = await finalizeGame(ctx.env.DB, {
    gameId,
    actorLabel: readActorLabel(ctx.request),
  });
  return jsonResponse({ game: updated }, { status: 200 });
};
