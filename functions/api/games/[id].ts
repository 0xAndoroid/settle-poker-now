/**
 * GET /api/games/:id — return the full snapshot of a persistent game.
 */

import { loadGame } from '../../lib/db';
import { OPTIONS_NO_CONTENT, errorResponse, jsonResponse } from '../../lib/responses';

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

const ID_PATTERN = /^[0-9a-z]{6,16}$/i;

export const onRequestOptions: PagesFunction<Env> = async () => OPTIONS_NO_CONTENT;

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const id = (ctx.params.id as string | undefined)?.trim() ?? '';
  if (!ID_PATTERN.test(id)) {
    return errorResponse(400, 'Invalid game id.');
  }
  const snapshot = await loadGame(ctx.env.DB, id);
  if (!snapshot) {
    return errorResponse(404, `No persistent game with id "${id}".`);
  }
  return jsonResponse(
    { game: snapshot },
    {
      headers: {
        // Browser cache the snapshot briefly; the OG crawler benefits.
        'Cache-Control': 'public, max-age=10, must-revalidate',
        'X-Game-Updated-At': String(snapshot.game.updatedAt),
      },
    }
  );
};
