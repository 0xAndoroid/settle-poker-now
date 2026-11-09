/**
 * GET /api/live-games/:id — return a live game snapshot.
 * DELETE /api/live-games/:id — permanently delete an unfinalized live game.
 */

import { deleteLiveGame, loadLiveGame, LiveNotFoundError, setLiveLedgerBalancing } from '../../lib/live-db';
import {
  CORS_HEADERS,
  OPTIONS_NO_CONTENT,
  errorResponse,
  jsonResponse,
  mapMutationError,
  readActorLabel,
  readClientEventId,
  readJsonBody,
} from '../../lib/responses';

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

export const onRequestDelete: PagesFunction<Env> = async (ctx) => {
  const id = (ctx.params.id as string | undefined)?.trim() ?? '';
  if (!ID_PATTERN.test(id)) return errorResponse(400, 'Invalid live game id.');
  try {
    await deleteLiveGame(ctx.env.DB, id);
    return new Response(null, {
      status: 204,
      headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    if (err instanceof LiveNotFoundError) return errorResponse(404, err.message);
    const mapped = mapMutationError(err);
    if (mapped) return mapped;
    throw err;
  }
};

export const onRequestPatch: PagesFunction<Env> = async (ctx) => {
  const gameId = (ctx.params.id as string | undefined)?.trim() ?? '';
  if (!ID_PATTERN.test(gameId)) return errorResponse(400, 'Invalid live game id.');
  const parsed = await readJsonBody<{ clientEventId?: string; ledgerBalancing?: unknown }>(ctx.request);
  if (!parsed.ok) return parsed.response;
  const clientEventId = readClientEventId(ctx.request, parsed.body);
  if (!clientEventId) return errorResponse(400, 'clientEventId is required.');
  try {
    const game = await setLiveLedgerBalancing(ctx.env.DB, {
      gameId,
      clientEventId,
      actorLabel: readActorLabel(ctx.request),
      ledgerBalancing: parsed.body.ledgerBalancing,
    });
    return jsonResponse({ game });
  } catch (err) {
    if (err instanceof LiveNotFoundError) return errorResponse(404, err.message);
    const mapped = mapMutationError(err);
    if (mapped) return mapped;
    throw err;
  }
};
