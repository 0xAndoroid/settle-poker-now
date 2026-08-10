/**
 * POST /api/live-games/:id/finalize
 *
 * Finalizes a live game into the existing persistent /g/:id settlement.
 */

import { LiveConflictError, LiveNotFoundError, finalizeLiveGame } from '../../../lib/live-db';
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
  actorLabel?: string | null;
  force?: boolean;
  roundToDollars?: boolean;
  isolations?: Array<{ playerId?: unknown; counterpartId?: unknown }>;
}

export const onRequestOptions: PagesFunction<Env> = async () => OPTIONS_NO_CONTENT;

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const gameId = (ctx.params.id as string).trim();
  const parsed = await readJsonBody<Body>(ctx.request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const clientEventId = readClientEventId(ctx.request, body);
  if (!clientEventId) return errorResponse(400, 'clientEventId is required.');
  let isolations: Array<{ playerId: string; counterpartId: string }>;
  try {
    isolations = readIsolations(body);
  } catch (err) {
    return errorResponse(
      400,
      err instanceof Error ? err.message : 'isolations must be a list of {playerId,counterpartId}.'
    );
  }

  try {
    const actorLabel =
      typeof body.actorLabel === 'string'
        ? body.actorLabel.trim().slice(0, 64) || null
        : readActorLabel(ctx.request);
    const result = await finalizeLiveGame(ctx.env.DB, {
      gameId,
      clientEventId,
      actorLabel,
      force: body.force === true,
      roundToDollars: body.roundToDollars !== false,
      isolations,
    });
    return jsonResponse(result);
  } catch (err) {
    if (err instanceof LiveNotFoundError) return errorResponse(404, err.message);
    if (err instanceof LiveConflictError) return errorResponse(409, err.message);
    const mapped = mapMutationError(err);
    if (mapped) return mapped;
    throw err;
  }
};

function readIsolations(body: Body): Array<{ playerId: string; counterpartId: string }> {
  if (body.isolations === undefined) return [];
  if (!Array.isArray(body.isolations)) {
    throw new Error('isolations must be a list of {playerId,counterpartId}.');
  }
  return body.isolations.map((rule) => {
    if (typeof rule.playerId !== 'string' || typeof rule.counterpartId !== 'string') {
      throw new Error('isolations must be a list of {playerId,counterpartId}.');
    }
    return {
      playerId: rule.playerId,
      counterpartId: rule.counterpartId,
    };
  });
}
