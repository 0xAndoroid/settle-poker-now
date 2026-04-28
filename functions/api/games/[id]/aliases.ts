/**
 * POST /api/games/:id/aliases
 *
 * Body: { playerId, aliasToPlayerId }
 *
 * Folds `playerId` into `aliasToPlayerId` for this game. Validation
 * happens server-side (cycle, self-alias, missing players). The
 * settlement plan is re-derived and the full updated snapshot is
 * returned for the client to replace local state authoritatively.
 */

import {
  AliasValidationError,
  addAlias,
  loadGameRow,
} from '../../../lib/db';
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

interface Body {
  playerId?: string;
  aliasToPlayerId?: string;
}

export const onRequestOptions: PagesFunction<Env> = async () => OPTIONS_NO_CONTENT;

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const gameId = (ctx.params.id as string).trim();

  let body: Body;
  try {
    body = (await ctx.request.json()) as Body;
  } catch {
    return errorResponse(400, 'Body must be JSON.');
  }
  if (
    typeof body.playerId !== 'string' ||
    typeof body.aliasToPlayerId !== 'string'
  ) {
    return errorResponse(400, 'playerId and aliasToPlayerId required.');
  }

  const game = await loadGameRow(ctx.env.DB, gameId);
  if (!game) return errorResponse(404, `No game with id "${gameId}".`);

  try {
    const updated = await addAlias(ctx.env.DB, {
      gameId,
      playerId: body.playerId,
      aliasToPlayerId: body.aliasToPlayerId,
      actorLabel: readActorLabel(ctx.request),
    });
    return jsonResponse({ game: updated }, { status: 201 });
  } catch (err) {
    if (err instanceof AliasValidationError) {
      return errorResponse(400, err.message);
    }
    throw err;
  }
};
