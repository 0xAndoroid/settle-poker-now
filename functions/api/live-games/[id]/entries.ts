/**
 * POST /api/live-games/:id/entries
 *
 * Body:
 *   { clientEventId, playerId, entryType, amountCents, ... }
 *   { clientEventId, action: 'busted_paid_host', playerId, amountCents, ... }
 */

import { LiveNotFoundError, addBustedPaidHost, addLiveEntry } from '../../../lib/live-db';
import type { LiveEntryType, LivePaymentMethod } from '../../../../src/lib/types';
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
  action?: 'busted_paid_host';
  playerId?: string;
  entryType?: LiveEntryType;
  amountCents?: number;
  toPlayerId?: string | null;
  paymentMethod?: LivePaymentMethod | null;
  isFinal?: boolean;
  note?: string | null;
}

export const onRequestOptions: PagesFunction<Env> = async () => OPTIONS_NO_CONTENT;

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const gameId = (ctx.params.id as string).trim();
  const parsed = await readJsonBody<Body>(ctx.request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const clientEventId = readClientEventId(ctx.request, body);
  if (!clientEventId) return errorResponse(400, 'clientEventId is required.');
  if (typeof body.playerId !== 'string') return errorResponse(400, 'playerId is required.');
  if (typeof body.amountCents !== 'number') {
    return errorResponse(400, 'amountCents is required.');
  }
  if (body.action !== 'busted_paid_host' && typeof body.entryType !== 'string') {
    return errorResponse(400, 'entryType is required.');
  }

  try {
    const actorLabel = readActorLabel(ctx.request);
    const snapshot =
      body.action === 'busted_paid_host'
        ? await addBustedPaidHost(ctx.env.DB, {
            gameId,
            clientEventId,
            actorLabel,
            playerId: body.playerId,
            amountCents: Math.trunc(body.amountCents),
            toPlayerId: body.toPlayerId ?? null,
            paymentMethod: body.paymentMethod ?? null,
            note: typeof body.note === 'string' ? body.note : null,
          })
        : await addLiveEntry(ctx.env.DB, {
            gameId,
            clientEventId,
            actorLabel,
            playerId: body.playerId,
            entryType: body.entryType as LiveEntryType,
            amountCents: Math.trunc(body.amountCents),
            toPlayerId: body.toPlayerId ?? null,
            paymentMethod: body.paymentMethod ?? null,
            isFinal: body.isFinal === true,
            note: typeof body.note === 'string' ? body.note : null,
          });
    return jsonResponse({ game: snapshot }, { status: 201 });
  } catch (err) {
    if (err instanceof LiveNotFoundError) return errorResponse(404, err.message);
    const mapped = mapMutationError(err);
    if (mapped) return mapped;
    throw err;
  }
};
