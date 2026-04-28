/**
 * GET /api/ledger?gameId=<id>
 *
 * Pages Function — proxies the PokerNow ledger CSV for the ephemeral
 * (non-persistent) flow. The browser cannot fetch pokernow.com directly
 * due to CORS; this worker bridges + edge-caches.
 *
 * Also fetches the hand-replayer metadata in parallel and surfaces the
 * authoritative `cents` flag via the `X-Pokernow-Cents` response header.
 */

import {
  GAME_ID_PATTERN,
  LEDGER_CACHE_TTL_SECONDS,
  detectCentsMode,
  fetchLedgerCsv,
} from '../lib/ledger-fetch';
import { CORS_HEADERS, OPTIONS_NO_CONTENT, textResponse } from '../lib/responses';

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
}

export const onRequestOptions: PagesFunction<Env> = async () => OPTIONS_NO_CONTENT;

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const gameId = (url.searchParams.get('gameId') ?? '').trim();

  if (!gameId) return textResponse(400, 'Missing gameId query parameter.');
  if (!GAME_ID_PATTERN.test(gameId)) {
    return textResponse(400, 'gameId contains invalid characters.');
  }

  // Demo bootstrap.
  if (gameId === 'demo') {
    const demoUrl = new URL('/demo-ledger.csv', ctx.request.url);
    const demo = await ctx.env.ASSETS.fetch(demoUrl);
    if (demo.ok) {
      const body = await demo.text();
      return new Response(body, {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'text/csv; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
          'X-Demo-Source': 'fixture',
          'X-Pokernow-Cents': 'true',
        },
      });
    }
    return textResponse(500, 'Demo fixture missing — file a bug.');
  }

  const [ledgerResult, centsMode] = await Promise.all([
    fetchLedgerCsv(gameId),
    detectCentsMode(gameId),
  ]);

  if (ledgerResult.status === 200 && ledgerResult.csv) {
    const headers: Record<string, string> = {
      ...(CORS_HEADERS as Record<string, string>),
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': `public, max-age=${LEDGER_CACHE_TTL_SECONDS}`,
    };
    if (centsMode !== null) {
      headers['X-Pokernow-Cents'] = centsMode ? 'true' : 'false';
    }
    return new Response(ledgerResult.csv, { status: 200, headers });
  }

  if (ledgerResult.status === 404) {
    return textResponse(
      404,
      `No ledger found for game "${gameId}". Double-check the URL.`
    );
  }
  return textResponse(
    ledgerResult.status,
    `Couldn't reach PokerNow for "${gameId}" (HTTP ${ledgerResult.status}). ${
      ledgerResult.errorBody?.slice(0, 240) ?? ''
    }`
  );
};
