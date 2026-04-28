/**
 * POST /api/games/:id/adjustments
 *
 * Body: { fromPlayerId, toPlayerId, amountCents }
 * Header: X-Actor-Label (optional, audit only).
 */

import { addAdjustment, loadGameRow } from '../../../lib/db';
import {
  OPTIONS_NO_CONTENT,
  errorResponse,
  jsonResponse,
  mapMutationError,
  readActorLabel,
} from '../../../lib/responses';

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

interface Body {
  fromPlayerId?: string;
  toPlayerId?: string;
  amountCents?: number;
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
    typeof body.fromPlayerId !== 'string' ||
    typeof body.toPlayerId !== 'string' ||
    typeof body.amountCents !== 'number'
  ) {
    return errorResponse(400, 'fromPlayerId, toPlayerId, amountCents required.');
  }
  if (body.fromPlayerId === body.toPlayerId) {
    return errorResponse(400, 'from and to must differ.');
  }
  if (!Number.isFinite(body.amountCents) || body.amountCents <= 0) {
    return errorResponse(400, 'amountCents must be a positive integer.');
  }

  const game = await loadGameRow(ctx.env.DB, gameId);
  if (!game) return errorResponse(404, `No game with id "${gameId}".`);

  try {
    const updated = await addAdjustment(ctx.env.DB, {
      gameId,
      fromPlayerId: body.fromPlayerId,
      toPlayerId: body.toPlayerId,
      amountCents: Math.trunc(body.amountCents),
      actorLabel: readActorLabel(ctx.request),
    });
    return jsonResponse({ game: updated }, { status: 201 });
  } catch (err) {
    const mapped = mapMutationError(err);
    if (mapped) return mapped;
    throw err;
  }
};
