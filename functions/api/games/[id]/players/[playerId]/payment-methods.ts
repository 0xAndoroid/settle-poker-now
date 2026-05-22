/**
 * POST /api/games/:id/players/:playerId/payment-methods
 *
 * Body: { venmoUsername?: string|null, zelleHandle?: string|null }
 *
 * Upserts the player's per-game payment handles. Allowed even after
 * the game is finalized (these are per-user UX settings). Settlement
 * rows that name this player as the WINNER will surface Venmo / Zelle
 * deep-link icons next to their nickname so the loser-paying side can
 * fire off the right deep link with the right amount.
 *
 * Zelle is free-text — email, US phone, or whatever the recipient's bank
 * app accepts. We don't discriminate on kind (the discriminator caused
 * fiddly UI in the identity prompt; see migration 0005).
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
  readJsonBody,
} from '../../../../../lib/responses';

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

interface Body {
  venmoUsername?: string | null;
  zelleHandle?: string | null;
}

const VENMO_USERNAME_PATTERN = /^@?[A-Za-z0-9_-]{1,30}$/;
const ZELLE_MAX_LENGTH = 128;

export const onRequestOptions: PagesFunction<Env> = async () => OPTIONS_NO_CONTENT;

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const gameId = (ctx.params.id as string).trim();
  const playerId = (ctx.params.playerId as string).trim();
  if (!gameId || !playerId) {
    return errorResponse(400, 'Missing game id or player id.');
  }

  const parsed = await readJsonBody<Body>(ctx.request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const venmoRaw = body.venmoUsername ?? null;
  const zelleRaw = body.zelleHandle ?? null;

  if (venmoRaw !== null && typeof venmoRaw !== 'string') {
    return errorResponse(400, 'venmoUsername must be a string or null.');
  }
  if (
    venmoRaw !== null &&
    venmoRaw.trim().length > 0 &&
    !VENMO_USERNAME_PATTERN.test(venmoRaw.trim())
  ) {
    return errorResponse(
      400,
      'venmoUsername must be 1-30 characters of letters, digits, hyphens, or underscores (with optional leading @).'
    );
  }
  if (zelleRaw !== null && typeof zelleRaw !== 'string') {
    return errorResponse(400, 'zelleHandle must be a string or null.');
  }
  if (zelleRaw !== null && zelleRaw.trim().length > ZELLE_MAX_LENGTH) {
    return errorResponse(400, `zelleHandle must be ${ZELLE_MAX_LENGTH} characters or fewer.`);
  }

  const game = await loadGameRow(ctx.env.DB, gameId);
  if (!game) return errorResponse(404, `No game with id "${gameId}".`);

  try {
    const updated = await setPaymentMethods(ctx.env.DB, {
      gameId,
      playerId,
      venmoUsername: venmoRaw,
      zelleHandle: zelleRaw,
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
