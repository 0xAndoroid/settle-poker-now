/**
 * Venmo / Zelle payment-link helpers.
 *
 * Venmo uses TWO URL forms depending on the platform:
 *
 *   - **Mobile (iOS / iPadOS / Android):** `venmo://paycharge?txn=pay&recipients=<u>&amount=<x.xx>&note=<n>`.
 *     The custom-scheme URL is intercepted by the installed Venmo app
 *     and prefills the payment form. iOS/Android open the app directly
 *     — much better UX than a browser hop.
 *
 *   - **Desktop / everything else:** `https://venmo.com/u/<u>?txn=pay&amount=<x.xx>&note=<n>`.
 *     The web URL opens venmo.com in a tab; if the user is logged in
 *     the recipient's profile shows with the prefilled query params.
 *     Desktop browsers ignore `venmo://` schemes (no app installed),
 *     so the universal URL is the right path there.
 *
 * The caller picks the right URL via `detectMobilePlatform()` (compute
 * once at module load — UA doesn't change during the session).
 *
 * Zelle has no cross-bank deep-link, so we just surface the handle for
 * the user to paste in their bank app — `formatZelleHandle` trims it.
 *
 * All functions are pure + synchronous + thoroughly unit-tested.
 */

const DEFAULT_NOTE = 'poker night';

export type VenmoPlatform = 'mobile' | 'desktop';

export interface VenmoLinkInput {
  /** Venmo username, with or without leading `@` (we strip it). */
  recipientUsername: string;
  amountCents: number;
  /**
   * Optional override for the note. Falls back to "poker night" when
   * unset / empty / whitespace-only. Encoded into the query string.
   */
  note?: string | null;
  /** Determines URL form (`venmo://...` for mobile, https for desktop). */
  platform: VenmoPlatform;
}

export function composeVenmoPayUrl({
  recipientUsername,
  amountCents,
  note,
  platform,
}: VenmoLinkInput): string {
  const username = recipientUsername.trim().replace(/^@+/, '');
  if (!username) throw new Error('Venmo username is empty.');
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error('Venmo amount must be a positive number of cents.');
  }
  const dollars = (amountCents / 100).toFixed(2);
  const trimmedNote = (note ?? '').trim();
  const finalNote = trimmedNote.length > 0 ? trimmedNote : DEFAULT_NOTE;

  if (platform === 'mobile') {
    // Custom-scheme — username goes in the `recipients=` query param,
    // not the path. iOS/Android intercept and hand off to the app.
    const params = new URLSearchParams();
    params.set('txn', 'pay');
    params.set('recipients', username);
    params.set('amount', dollars);
    params.set('note', finalNote);
    return `venmo://paycharge?${params.toString()}`;
  }

  // Desktop universal — username in the path, encoded.
  const params = new URLSearchParams();
  params.set('txn', 'pay');
  params.set('amount', dollars);
  params.set('note', finalNote);
  return `https://venmo.com/u/${encodeURIComponent(username)}?${params.toString()}`;
}

/**
 * Pure UA predicate, lifted out of `detectMobilePlatform` so unit tests
 * can exercise both branches with sample strings instead of mocking
 * `navigator`. Spec regex per the PM brief.
 */
export function isMobileUserAgent(userAgent: string): boolean {
  return /iPhone|iPad|iPod|Android/i.test(userAgent);
}

/**
 * Resolve the Venmo platform from the runtime UA. Defaults to 'desktop'
 * when `navigator` is unavailable (SSR / non-DOM contexts) — desktop
 * URL is the safe fallback because it works everywhere; the only cost
 * of a miss is a browser hop instead of an app handoff.
 */
export function detectMobilePlatform(): VenmoPlatform {
  if (typeof navigator === 'undefined') return 'desktop';
  return isMobileUserAgent(navigator.userAgent) ? 'mobile' : 'desktop';
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
