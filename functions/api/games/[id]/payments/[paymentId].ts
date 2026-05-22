/**
 * PATCH /api/games/:id/payments/:paymentId
 *
 * Body: { completed: boolean }
 * Header: X-Actor-Label (optional, used for audit trail).
 */

import { loadGameRow, setPaymentCompleted } from '../../../../lib/db';
import {
  OPTIONS_NO_CONTENT,
  errorResponse,
  jsonResponse,
  readActorLabel,
  readJsonBody,
} from '../../../../lib/responses';

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

export const onRequestOptions: PagesFunction<Env> = async () => OPTIONS_NO_CONTENT;

export const onRequestPatch: PagesFunction<Env> = async (ctx) => {
  const gameId = (ctx.params.id as string).trim();
  const paymentId = (ctx.params.paymentId as string).trim();
  if (!gameId || !paymentId) {
    return errorResponse(400, 'Missing game id or payment id.');
  }

  const parsed = await readJsonBody<{ completed?: unknown }>(ctx.request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (typeof body.completed !== 'boolean') {
    return errorResponse(400, 'Body.completed must be a boolean.');
  }

  // Confirm the game exists before mutating; gives a clean 404.
  const game = await loadGameRow(ctx.env.DB, gameId);
  if (!game) return errorResponse(404, `No game with id "${gameId}".`);

  const updated = await setPaymentCompleted(ctx.env.DB, {
    gameId,
    paymentId,
    completed: body.completed,
    actorLabel: readActorLabel(ctx.request),
  });
  if (!updated) {
    return errorResponse(404, `No payment with id "${paymentId}".`);
  }
  // Return the full updated snapshot so the client can replace local
  // state authoritatively without an extra round-trip — closes the
  // optimistic-vs-poll race window.
  return jsonResponse({ game: updated });
};
