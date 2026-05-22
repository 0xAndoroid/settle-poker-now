/**
 * POST /api/live-games/:id/players
 *
 * Body: { clientEventId, name, isHost? }
 */

import { addLivePlayer, LiveNotFoundError } from '../../../lib/live-db';
import {
  OPTIONS_NO_CONTENT,
  errorResponse,
  jsonResponse,
  mapMutationError,
  readActorLabel,
  readClientEventId,
  readJsonBody,
} from '../../../lib/responses';

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

interface Body {
  clientEventId?: string;
  name?: string;
  isHost?: boolean;
}

export const onRequestOptions: PagesFunction<Env> = async () => OPTIONS_NO_CONTENT;

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const gameId = (ctx.params.id as string).trim();
  const parsed = await readJsonBody<Body>(ctx.request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const clientEventId = readClientEventId(ctx.request, body);
  if (!clientEventId) return errorResponse(400, 'clientEventId is required.');
  if (typeof body.name !== 'string') {
    return errorResponse(400, 'name is required.');
  }

  try {
    const snapshot = await addLivePlayer(ctx.env.DB, {
      gameId,
      clientEventId,
      name: body.name,
      isHost: body.isHost === true,
      actorLabel: readActorLabel(ctx.request),
    });
    return jsonResponse({ game: snapshot }, { status: 201 });
  } catch (err) {
    if (err instanceof LiveNotFoundError) return errorResponse(404, err.message);
    const mapped = mapMutationError(err);
    if (mapped) return mapped;
    throw err;
  }
};
