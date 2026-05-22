/**
 * GET /api/live-games/:id — return a live game snapshot.
 */

import { loadLiveGame } from '../../lib/live-db';
import { OPTIONS_NO_CONTENT, errorResponse, jsonResponse } from '../../lib/responses';

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

const ID_PATTERN = /^[0-9a-z]{6,16}$/i;

export const onRequestOptions: PagesFunction<Env> = async () => OPTIONS_NO_CONTENT;

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const id = (ctx.params.id as string | undefined)?.trim() ?? '';
  if (!ID_PATTERN.test(id)) return errorResponse(400, 'Invalid live game id.');
  const snapshot = await loadLiveGame(ctx.env.DB, id);
  if (!snapshot) return errorResponse(404, `No live game with id "${id}".`);
  return jsonResponse(
    { game: snapshot },
    {
      headers: {
        'Cache-Control': 'no-store',
        'X-Live-Game-Id': snapshot.game.id,
      },
    }
  );
};
