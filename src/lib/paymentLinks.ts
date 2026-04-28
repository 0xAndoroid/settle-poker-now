/**
 * Venmo / Zelle payment-link helpers.
 *
 * Both flows are bare-bones — no API integration, just deep-link string
 * composition that hands off to the user's installed wallet app:
 *
 *   - Venmo: `venmo://paycharge?txn=pay&recipients=<u>&amount=<usd>&note=<text>`
 *     The `venmo.com/u/<u>` https fallback is unreliable for amount + note
 *     pre-fill, so we only emit the custom-scheme URL. iOS / Android
 *     intercept it; desktop browsers will refuse to open it (intentional —
 *     Venmo on desktop has no reliable deep-link path; the user has to
 *     paste the username manually).
 *
 *   - Zelle: there is no cross-bank Zelle deep-link. We surface the handle
 *     for the user to paste in their bank app. The icon click copies it.
 *
 * Both functions are pure + synchronous + thoroughly unit-tested for URL
 * encoding correctness.
 */

const VENMO_NOTE = 'settle.andrew.ee';

export interface VenmoLinkInput {
  /** Venmo username, with or without leading `@` (we strip it). */
  recipientUsername: string;
  amountCents: number;
  /** Optional override for the note. Defaults to `settle.andrew.ee`. */
  note?: string;
}

export function composeVenmoPayUrl({
  recipientUsername,
  amountCents,
  note,
}: VenmoLinkInput): string {
  const username = recipientUsername.trim().replace(/^@+/, '');
  if (!username) throw new Error('Venmo username is empty.');
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error('Venmo amount must be a positive number of cents.');
  }
  const dollars = (amountCents / 100).toFixed(2);
  const params = new URLSearchParams();
  params.set('txn', 'pay');
  params.set('recipients', username);
  params.set('amount', dollars);
  params.set('note', note ?? VENMO_NOTE);
  return `venmo://paycharge?${params.toString()}`;
}

export interface ZelleHandleDescriptor {
  handle: string;
  kind: 'email' | 'phone';
}

/**
 * Display string for a Zelle handle — used in toast messages so the user
 * sees what got copied to their clipboard. Trims whitespace; for phone
 * handles we present them verbatim (no auto-format; users have varying
 * regional conventions).
 */
export function formatZelleHandle({
  handle,
  kind,
}: ZelleHandleDescriptor): string {
  const trimmed = handle.trim();
  return kind === 'email' ? trimmed : trimmed;
}
