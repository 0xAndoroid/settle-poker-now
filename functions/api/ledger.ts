/**
 * GET /api/ledger?gameId=<id>
 *
 * Pages Function — proxies the PokerNow ledger CSV.
 * The browser cannot fetch pokernow.com directly because pokernow does not
 * send CORS headers. This worker fetches it server-side and re-emits with
 * permissive CORS + a short edge cache.
 */

interface Env {
  /** Static asset binding — automatically provided by Pages for /public files. */
  ASSETS: Fetcher;
}

const GAME_ID_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;
const CACHE_TTL_SECONDS = 60;

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type',
  };
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
};

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const gameId = (url.searchParams.get('gameId') ?? '').trim();

  if (!gameId) {
    return jsonError(400, 'Missing gameId query parameter.');
  }
  if (!GAME_ID_PATTERN.test(gameId)) {
    return jsonError(400, 'gameId contains invalid characters.');
  }

  // Demo mode — serve the bundled fixture so anyone can try the app without a
  // real PokerNow session.
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
        },
      });
    }
    return jsonError(500, 'Demo fixture missing — file a bug.');
  }

  // Try the .com host first; PokerNow has been migrating between .club and .com.
  const candidates = [
    `https://www.pokernow.com/games/${gameId}/ledger_${gameId}.csv`,
    `https://www.pokernow.club/games/${gameId}/ledger_${gameId}.csv`,
  ];

  let lastStatus = 502;
  let lastBody: string | null = null;

  for (const target of candidates) {
    try {
      const upstream = await fetch(target, {
        redirect: 'follow',
        headers: {
          // Identify ourselves but mimic a browser-friendly Accept header.
          'User-Agent': 'settle.andrew.ee/0.2 (+https://settle.andrew.ee)',
          Accept: 'text/csv, text/plain;q=0.9, */*;q=0.5',
        },
        cf: {
          // Edge cache the upstream response. Game ledgers are append-only
          // during a session; refresh every 60s.
          cacheTtl: CACHE_TTL_SECONDS,
          cacheEverything: true,
        },
      });

      if (upstream.ok) {
        const csv = await upstream.text();
        // Sanity: a real ledger always starts with the player_nickname column.
        if (!csv.includes('player_nickname')) {
          lastStatus = 502;
          lastBody = 'Upstream returned a body that does not look like a ledger.';
          continue;
        }
        const sanitizedHosts = candidates.map((c) => new URL(c).host).join(', ');
        return new Response(csv, {
          status: 200,
          headers: {
            ...corsHeaders(),
            'Content-Type': 'text/csv; charset=utf-8',
            'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
            'X-Upstream-Hosts': sanitizedHosts,
          },
        });
      }

      lastStatus = upstream.status;
      lastBody = await upstream.text().catch(() => null);
    } catch (err) {
      lastStatus = 502;
      lastBody = (err as Error).message;
    }
  }

  // All candidates failed — surface a useful error.
  if (lastStatus === 404) {
    return jsonError(404, `No ledger found for game "${gameId}". Double-check the URL.`);
  }
  return jsonError(
    lastStatus,
    `Couldn't reach PokerNow for "${gameId}" (HTTP ${lastStatus}). ${lastBody?.slice(0, 240) ?? ''}`
  );
};

function jsonError(status: number, message: string): Response {
  // We deliberately send plain text so the front-end can `.text()` it.
  return new Response(message, {
    status,
    headers: {
      ...corsHeaders(),
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
