/**
 * PATCH /api/games/:id/note
 *
 * Body: { note: string | null }
 *
 * Update the per-game note (used as the Venmo deep-link `note=` param).
 * Allowed even when the game is finalized — it's a per-user UX setting,
 * not game state. Pass `null` or an empty string to clear.
 *
 * Returns the full updated snapshot.
 */

import { loadGameRow, setGameNote } from '../../../lib/db';
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
  note?: string | null;
}

const NOTE_MAX_LENGTH = 80;

export const onRequestOptions: PagesFunction<Env> = async () => OPTIONS_NO_CONTENT;

export const onRequestPatch: PagesFunction<Env> = async (ctx) => {
  const gameId = (ctx.params.id as string).trim();
  if (!gameId) return errorResponse(400, 'Missing game id.');

  let body: Body;
  try {
    body = (await ctx.request.json()) as Body;
  } catch {
    return errorResponse(400, 'Body must be JSON.');
  }

  const raw = body.note ?? null;
  if (raw !== null && typeof raw !== 'string') {
    return errorResponse(400, 'note must be a string or null.');
  }
  if (raw !== null && raw.length > NOTE_MAX_LENGTH * 2) {
    // Server-side cap keeps abusive payloads out of the audit log even
    // though `setGameNote` will trim further.
    return errorResponse(
      400,
      `note must be ${NOTE_MAX_LENGTH} characters or fewer.`
    );
  }

  const game = await loadGameRow(ctx.env.DB, gameId);
  if (!game) return errorResponse(404, `No game with id "${gameId}".`);

  const updated = await setGameNote(ctx.env.DB, {
    gameId,
    note: raw,
    actorLabel: readActorLabel(ctx.request),
  });
  return jsonResponse({ game: updated });
};
