/**
 * POST /api/games/:id/players/:playerId/payment-methods
 *
 * Body: { venmoUsername?: string|null, zelleHandle?: string|null,
 *         zelleHandleKind?: 'email'|'phone'|null }
 *
 * Upserts the player's per-game payment handles. Allowed even after
 * the game is finalized (these are per-user UX settings). Settlement
 * rows that name this player as the WINNER will surface Venmo / Zelle
 * deep-link icons next to their nickname so the loser-paying side can
 * fire off the right deep link with the right amount.
 *
 * Returns the full updated snapshot.
 */

import {
  PaymentMethodValidationError,
  loadGameRow,
  setPaymentMethods,
} from '../../../../../lib/db';
import {
  OPTIONS_NO_CONTENT,
  errorResponse,
  jsonResponse,
  readActorLabel,
} from '../../../../../lib/responses';
import type { ZelleHandleKind } from '../../../../../lib/db';

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

interface Body {
  venmoUsername?: string | null;
  zelleHandle?: string | null;
  zelleHandleKind?: ZelleHandleKind | null;
}

const VENMO_USERNAME_PATTERN = /^@?[A-Za-z0-9_-]{1,30}$/;

export const onRequestOptions: PagesFunction<Env> = async () => OPTIONS_NO_CONTENT;

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const gameId = (ctx.params.id as string).trim();
  const playerId = (ctx.params.playerId as string).trim();
  if (!gameId || !playerId) {
    return errorResponse(400, 'Missing game id or player id.');
  }

  let body: Body;
  try {
    body = (await ctx.request.json()) as Body;
  } catch {
    return errorResponse(400, 'Body must be JSON.');
  }

  const venmoRaw = body.venmoUsername ?? null;
  const zelleRaw = body.zelleHandle ?? null;
  const zelleKind = body.zelleHandleKind ?? null;

  if (venmoRaw !== null && typeof venmoRaw !== 'string') {
    return errorResponse(400, 'venmoUsername must be a string or null.');
  }
  if (venmoRaw !== null && venmoRaw.trim().length > 0 && !VENMO_USERNAME_PATTERN.test(venmoRaw.trim())) {
    return errorResponse(
      400,
      'venmoUsername must be 1-30 characters of letters, digits, hyphens, or underscores (with optional leading @).'
    );
  }
  if (zelleRaw !== null && typeof zelleRaw !== 'string') {
    return errorResponse(400, 'zelleHandle must be a string or null.');
  }
  if (zelleKind !== null && zelleKind !== 'email' && zelleKind !== 'phone') {
    return errorResponse(
      400,
      `zelleHandleKind must be one of "email", "phone", or null.`
    );
  }
  if ((zelleRaw && zelleRaw.trim() !== '') !== (zelleKind !== null)) {
    return errorResponse(
      400,
      'Provide both zelleHandle and zelleHandleKind, or neither.'
    );
  }

  const game = await loadGameRow(ctx.env.DB, gameId);
  if (!game) return errorResponse(404, `No game with id "${gameId}".`);

  try {
    const updated = await setPaymentMethods(ctx.env.DB, {
      gameId,
      playerId,
      venmoUsername: venmoRaw,
      zelleHandle: zelleRaw,
      zelleHandleKind: zelleKind,
      actorLabel: readActorLabel(ctx.request),
    });
    return jsonResponse({ game: updated }, { status: 201 });
  } catch (err) {
    if (err instanceof PaymentMethodValidationError) {
      return errorResponse(400, err.message);
    }
    throw err;
  }
};
