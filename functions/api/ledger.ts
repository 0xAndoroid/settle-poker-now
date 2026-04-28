/**
 * GET /api/ledger?gameId=<id>
 *
 * Pages Function — proxies the PokerNow ledger CSV.
 *
 * The browser cannot fetch pokernow.com directly because pokernow does not
 * send CORS headers. This worker fetches it server-side and re-emits with
 * permissive CORS + a short edge cache.
 *
 * The worker also fetches the hand-replayer metadata API (in parallel)
 * to determine whether the game runs in cents-mode or dollars-mode, and
 * surfaces the unit via the `X-Pokernow-Cents` response header. Without
 * this, dollars-mode games (where `net` is whole dollars, not cents)
 * render at 1/100 of the correct value.
 */

interface Env {
  /** Static asset binding — automatically provided by Pages for /public files. */
  ASSETS: Fetcher;
}

const GAME_ID_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;
const CACHE_TTL_SECONDS = 60;
const META_TIMEOUT_MS = 4000;

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type',
    // Expose our metadata header so fetch() can read it from JS.
    'Access-Control-Expose-Headers': 'X-Pokernow-Cents, X-Demo-Source, X-Upstream-Hosts',
  };
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
};

interface LedgerFetchResult {
  csv: string;
  status: number;
  errorBody?: string;
}

async function fetchLedger(gameId: string): Promise<LedgerFetchResult> {
  // Try .com first; PokerNow has been migrating between .club and .com.
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
          'User-Agent': 'settle.andrew.ee/0.3 (+https://settle.andrew.ee)',
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
        lastBody = 'Upstream returned a body that does not look like a ledger.';
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
 * Fetch the hand-replayer metadata for a game and return whether the game
 * runs in cents mode. Returns `null` on any failure — callers fall back to
 * the parser heuristic.
 */
async function detectCentsMode(gameId: string): Promise<boolean | null> {
  const url = `https://www.pokernow.com/api/hand-replayer/game/${gameId}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), META_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'settle.andrew.ee/0.3 (+https://settle.andrew.ee)',
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

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const gameId = (url.searchParams.get('gameId') ?? '').trim();

  if (!gameId) {
    return jsonError(400, 'Missing gameId query parameter.');
  }
  if (!GAME_ID_PATTERN.test(gameId)) {
    return jsonError(400, 'gameId contains invalid characters.');
  }

  // Demo mode — bundled fixture (cents-mode by construction).
  if (gameId === 'demo') {
    const demoUrl = new URL('/demo-ledger.csv', ctx.request.url);
    const demo = await ctx.env.ASSETS.fetch(demoUrl);
    if (demo.ok) {
      const body = await demo.text();
      return new Response(body, {
        status: 200,
        headers: {
          ...corsHeaders(),
          'Content-Type': 'text/csv; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
          'X-Demo-Source': 'fixture',
          'X-Pokernow-Cents': 'true',
        },
      });
    }
    return jsonError(500, 'Demo fixture missing — file a bug.');
  }

  // Fetch ledger CSV + hand-replayer meta concurrently.
  const [ledgerResult, centsMode] = await Promise.all([
    fetchLedger(gameId),
    detectCentsMode(gameId),
  ]);

  if (ledgerResult.status === 200 && ledgerResult.csv) {
    const headers: Record<string, string> = {
      ...(corsHeaders() as Record<string, string>),
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
    };
    if (centsMode !== null) {
      headers['X-Pokernow-Cents'] = centsMode ? 'true' : 'false';
    }
    return new Response(ledgerResult.csv, { status: 200, headers });
  }

  if (ledgerResult.status === 404) {
    return jsonError(
      404,
      `No ledger found for game "${gameId}". Double-check the URL.`
    );
  }
  return jsonError(
    ledgerResult.status,
    `Couldn't reach PokerNow for "${gameId}" (HTTP ${ledgerResult.status}). ${
      ledgerResult.errorBody?.slice(0, 240) ?? ''
    }`
  );
};

function jsonError(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: {
      ...corsHeaders(),
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
