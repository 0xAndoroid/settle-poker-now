/**
 * Venmo / Zelle payment-link helpers.
 *
 * **Venmo:** universal HTTPS URL — `https://venmo.com/u/<u>?txn=pay&amount=<x>&note=<n>`.
 * Mobile devices auto-intercept and hand off to the Venmo app (which
 * prefills the payment form). Desktop browsers open venmo.com in a tab,
 * which prompts login if needed and shows the recipient's profile with
 * the prefilled query params honoured. No UA sniffing, no
 * `venmo://`-scheme fragility.
 *
 * **Zelle:** there is no cross-bank Zelle deep-link. We surface the
 * handle for the user to paste in their bank app. The icon click copies
 * it to clipboard.
 *
 * Both functions are pure + synchronous + thoroughly unit-tested for URL
 * encoding correctness.
 */

const DEFAULT_NOTE = 'poker night';

export interface VenmoLinkInput {
  /** Venmo username, with or without leading `@` (we strip it). */
  recipientUsername: string;
  amountCents: number;
  /**
   * Optional override for the note. Falls back to "poker night" when
   * unset / empty / whitespace-only. Encoded into the query string.
   */
  note?: string | null;
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
  const trimmedNote = (note ?? '').trim();
  const finalNote = trimmedNote.length > 0 ? trimmedNote : DEFAULT_NOTE;
  const params = new URLSearchParams();
  params.set('txn', 'pay');
  params.set('amount', dollars);
  params.set('note', finalNote);
  return `https://venmo.com/u/${encodeURIComponent(username)}?${params.toString()}`;
}

/**
 * Display string for a Zelle handle — used in toast messages so the user
 * sees what got copied to their clipboard. Just trims whitespace; we
 * don't try to discriminate email vs phone (free-text since migration
 * 0005).
 */
export function formatZelleHandle(handle: string): string {
  return handle.trim();
}
