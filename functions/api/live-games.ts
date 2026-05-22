/**
 * POST /api/live-games
 *
 * Create an editable live poker session. No auth: the unguessable /live/:id
 * URL is the edit/recovery link.
 */

import { createLiveGame } from '../lib/live-db';
import {
  CORS_HEADERS,
  OPTIONS_NO_CONTENT,
  errorResponse,
  jsonResponse,
  mapMutationError,
  readActorLabel,
  readClientEventId,
} from '../lib/responses';

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

interface Body {
  hostName?: string | null;
  totalChipBankCents?: number | null;
  title?: string | null;
  note?: string | null;
  clientEventId?: string;
}

export const onRequestOptions: PagesFunction<Env> = async () => OPTIONS_NO_CONTENT;

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  let body: Body;
  try {
    body = (await ctx.request.json()) as Body;
  } catch {
    body = {};
  }

  if (
    body.totalChipBankCents !== undefined &&
    body.totalChipBankCents !== null &&
    typeof body.totalChipBankCents !== 'number'
  ) {
    return errorResponse(400, 'totalChipBankCents must be a number.');
  }

  try {
    const snapshot = await createLiveGame(ctx.env.DB, {
      hostName: typeof body.hostName === 'string' ? body.hostName : null,
      totalChipBankCents: body.totalChipBankCents ?? null,
      title: typeof body.title === 'string' ? body.title : null,
      note: typeof body.note === 'string' ? body.note : null,
      actorLabel: readActorLabel(ctx.request),
      clientEventId: readClientEventId(ctx.request, body),
    });
    const liveUrl = new URL(`/live/${snapshot.game.id}`, ctx.request.url).toString();
    return jsonResponse(
      { game: snapshot, liveUrl },
      {
        status: 201,
        headers: {
          ...CORS_HEADERS,
          'X-Live-Game-Id': snapshot.game.id,
        },
      }
    );
  } catch (err) {
    const mapped = mapMutationError(err);
    if (mapped) return mapped;
    throw err;
  }
};
