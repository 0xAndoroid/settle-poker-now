/**
 * PokerNow URL handling. Accepts both `pokernow.club` and `pokernow.com` hosts,
 * with or without `www.` prefix, with or without trailing slashes/query params.
 */

const VALID_HOSTS = new Set(['pokernow.club', 'pokernow.com']);

/**
 * Extracts a PokerNow gameId from a user-pasted URL or returns null if the
 * input is not a recognizable PokerNow game URL.
 *
 * Accepts:
 *   - https://www.pokernow.club/games/abc123
 *   - https://pokernow.com/games/abc123/
 *   - http://www.pokernow.com/games/abc123?spectator=1
 *   - bare gameId (`abc123`) when input contains no slashes / dots
 */
export function extractGameId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Bare gameId fast path: alphanumeric + - and _, no slashes, no dots.
  if (/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    return trimmed;
  }

  // Need a parseable URL; users frequently omit the protocol.
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    try {
      url = new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  if (!VALID_HOSTS.has(host)) return null;

  const match = url.pathname.match(/\/games\/([A-Za-z0-9_-]+)\/?/);
  if (!match) return null;

  return match[1] ?? null;
}

/** Build the canonical /api/ledger URL for the worker proxy. */
export function ledgerProxyUrl(gameId: string): string {
  // The proxy worker lives at /api/ledger and accepts ?gameId=...
  const params = new URLSearchParams({ gameId });
  return `/api/ledger?${params.toString()}`;
}
