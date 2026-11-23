
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

export function ledgerProxyUrl(gameId: string): string {
  const params = new URLSearchParams({ gameId });
  return `/api/ledger?${params.toString()}`;
}
