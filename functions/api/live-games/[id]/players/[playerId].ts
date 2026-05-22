/**
 * PATCH /api/live-games/:id/players/:playerId
 *
 * Body supports { clientEventId, name?, status?, isHost? }.
 */

import {
  LiveNotFoundError,
  setHostPlayer,
  updateLivePlayer,
} from '../../../../lib/live-db';
import type { LivePlayerStatus } from '../../../../../src/lib/types';
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
  name?: string;
  status?: LivePlayerStatus;
  isHost?: boolean;
}

export const onRequestOptions: PagesFunction<Env> = async () => OPTIONS_NO_CONTENT;

export const onRequestPatch: PagesFunction<Env> = async (ctx) => {
  const gameId = (ctx.params.id as string).trim();
  const playerId = (ctx.params.playerId as string).trim();
  let body: Body;
  try {
    body = (await ctx.request.json()) as Body;
  } catch {
    return errorResponse(400, 'Body must be JSON.');
  }
  const clientEventId = readClientEventId(ctx.request, body);
  if (!clientEventId) return errorResponse(400, 'clientEventId is required.');

  try {
    const actorLabel = readActorLabel(ctx.request);
    const snapshot =
      body.isHost === true &&
      body.name === undefined &&
      body.status === undefined
        ? await setHostPlayer(ctx.env.DB, {
            gameId,
            playerId,
            clientEventId,
            actorLabel,
          })
        : await updateLivePlayer(ctx.env.DB, {
            gameId,
            playerId,
            clientEventId,
            actorLabel,
            name: body.name,
            status: body.status,
            isHost: body.isHost,
          });
    return jsonResponse({ game: snapshot });
  } catch (err) {
    if (err instanceof LiveNotFoundError) return errorResponse(404, err.message);
    const mapped = mapMutationError(err);
    if (mapped) return mapped;
    throw err;
  }
};
