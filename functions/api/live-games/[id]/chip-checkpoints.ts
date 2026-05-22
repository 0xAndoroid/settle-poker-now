/**
 * POST /api/live-games/:id/chip-checkpoints
 *
 * Body: { clientEventId, checkpointType, amountCents, note? }
 */

import { LiveNotFoundError, addChipCheckpoint } from '../../../lib/live-db';
import type { LiveChipCheckpointType } from '../../../../src/lib/types';
import {
  OPTIONS_NO_CONTENT,
  errorResponse,
  jsonResponse,
  mapMutationError,
  readActorLabel,
  readClientEventId,
} from '../../../lib/responses';

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

interface Body {
  clientEventId?: string;
  checkpointType?: LiveChipCheckpointType;
  amountCents?: number;
  note?: string | null;
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
  const clientEventId = readClientEventId(ctx.request, body);
  if (!clientEventId) return errorResponse(400, 'clientEventId is required.');
  if (typeof body.checkpointType !== 'string') {
    return errorResponse(400, 'checkpointType is required.');
  }
  if (typeof body.amountCents !== 'number') {
    return errorResponse(400, 'amountCents is required.');
  }

  try {
    const snapshot = await addChipCheckpoint(ctx.env.DB, {
      gameId,
      clientEventId,
      actorLabel: readActorLabel(ctx.request),
      checkpointType: body.checkpointType,
      amountCents: Math.trunc(body.amountCents),
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
