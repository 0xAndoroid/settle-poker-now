/**
 * Shared upstream ledger fetcher — used by both the proxy `/api/ledger`
 * route (returns the raw CSV) and the persistent `POST /api/games` route
 * (which parses + snapshots).
 *
 * Wraps two PokerNow endpoints fetched concurrently:
 *   - The ledger CSV (`/games/<id>/ledger_<id>.csv`)
 *   - The hand-replayer metadata (`/api/hand-replayer/game/<id>`) — used
 *     to read the authoritative `cents` flag.
 */

const CACHE_TTL_SECONDS = 60;
const META_TIMEOUT_MS = 4000;

export const GAME_ID_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;

export interface LedgerFetchResult {
  csv: string;
  status: number;
  errorBody?: string;
}

export async function fetchLedgerCsv(gameId: string): Promise<LedgerFetchResult> {
  // Try .com first; PokerNow has migrated between .club and .com.
  const candidates = [
    `https://www.pokernow.com/games/${gameId}/ledger_${gameId}.csv`,
    `https://www.pokernow.club/games/${gameId}/ledger_${gameId}.csv`,
  ];

  let lastStatus = 502;
  let lastBody = '';

  for (const target of candidates) {
    try {
      const upstream = await fetch(target, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'settle.andrew.ee/0.4 (+https://settle.andrew.ee)',
          Accept: 'text/csv, text/plain;q=0.9, */*;q=0.5',
        },
        cf: {
          cacheTtl: CACHE_TTL_SECONDS,
          cacheEverything: true,
        },
      });
      if (upstream.ok) {
        const csv = await upstream.text();
        if (csv.includes('player_nickname')) {
          return { csv, status: 200 };
        }
        lastStatus = 502;
        lastBody = 'Upstream body did not look like a ledger.';
        continue;
      }
      lastStatus = upstream.status;
      lastBody = await upstream.text().catch(() => '');
    } catch (err) {
      lastStatus = 502;
      lastBody = (err as Error).message;
    }
  }
  return { csv: '', status: lastStatus, errorBody: lastBody };
}

/**
 * Detect whether a PokerNow game is in cents-mode by reading the first
 * hand's metadata. Returns `null` on failure — callers must fall back to
 * the parser heuristic.
 */
export async function detectCentsMode(gameId: string): Promise<boolean | null> {
  const url = `https://www.pokernow.com/api/hand-replayer/game/${gameId}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), META_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'settle.andrew.ee/0.4 (+https://settle.andrew.ee)',
        Accept: 'application/json',
      },
      cf: {
        cacheTtl: CACHE_TTL_SECONDS,
        cacheEverything: true,
      },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { hands?: Array<{ cents?: boolean }> };
    const first = json.hands?.[0];
    if (first && typeof first.cents === 'boolean') return first.cents;
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const LEDGER_CACHE_TTL_SECONDS = CACHE_TTL_SECONDS;
