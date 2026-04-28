/**
 * POST /api/games
 *
 * Body: { pokernowUrl: string, actorLabel?: string }
 *
 * Fetches the PokerNow ledger CSV + cents-mode metadata, parses, snapshots
 * to D1, computes the initial settlement plan, returns the game id and
 * full snapshot.
 */

import { parseLedgerCsv } from '../../src/lib/csv';
import { extractGameId } from '../../src/lib/pokernow';
import { createGame } from '../lib/db';
import { detectCentsMode, fetchLedgerCsv } from '../lib/ledger-fetch';
import {
  CORS_HEADERS,
  OPTIONS_NO_CONTENT,
  errorResponse,
  jsonResponse,
} from '../lib/responses';

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

interface CreateBody {
  pokernowUrl?: string;
  actorLabel?: string;
}

export const onRequestOptions: PagesFunction<Env> = async () => OPTIONS_NO_CONTENT;

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  let body: CreateBody;
  try {
    body = (await ctx.request.json()) as CreateBody;
  } catch {
    return errorResponse(400, 'Body must be JSON.');
  }

  const url = (body.pokernowUrl ?? '').trim();
  if (!url) return errorResponse(400, 'pokernowUrl is required.');

  const pokernowGameId = extractGameId(url);
  if (!pokernowGameId) {
    return errorResponse(400, 'Not a recognizable PokerNow game URL.');
  }

  // Demo bootstrap path — let users create a persistent demo link.
  if (pokernowGameId === 'demo') {
    const demoUrl = new URL('/demo-ledger.csv', ctx.request.url);
    const demo = await ctx.env.ASSETS.fetch(demoUrl);
    if (!demo.ok) {
      return errorResponse(500, 'Demo fixture missing.');
    }
    const demoCsv = await demo.text();
    const ledger = parseLedgerCsv(demoCsv, { unit: 'cents' });
    const snapshot = await createGame(ctx.env.DB, {
      pokernowGameId: 'demo',
      sourceUnit: 'cents',
      unitProvenance: 'header',
      startedAt: ledger.startedAt?.getTime() ?? null,
      endedAt: ledger.endedAt?.getTime() ?? null,
      rows: ledger.rows,
      actorLabel: body.actorLabel ?? null,
    });
    return jsonResponse(
      { id: snapshot.game.id, game: snapshot },
      { status: 201, headers: { ...CORS_HEADERS, 'X-Game-Id': snapshot.game.id } }
    );
  }

  const [csvResult, centsMode] = await Promise.all([
    fetchLedgerCsv(pokernowGameId),
    detectCentsMode(pokernowGameId),
  ]);
  if (csvResult.status !== 200 || !csvResult.csv) {
    if (csvResult.status === 404) {
      return errorResponse(404, `No ledger found for "${pokernowGameId}".`);
    }
    return errorResponse(
      csvResult.status,
      `Couldn't reach PokerNow (HTTP ${csvResult.status}). ${csvResult.errorBody?.slice(0, 240) ?? ''}`
    );
  }

  // Pick unit + provenance.
  const unitFromHeader =
    centsMode === true ? 'cents' : centsMode === false ? 'dollars' : null;

  let ledger;
  let provenance: 'header' | 'heuristic';
  if (unitFromHeader) {
    ledger = parseLedgerCsv(csvResult.csv, { unit: unitFromHeader });
    provenance = 'header';
  } else {
    ledger = parseLedgerCsv(csvResult.csv);
    provenance = 'heuristic';
  }

  if (ledger.rows.length === 0) {
    return errorResponse(422, 'Ledger has no players.');
  }

  const snapshot = await createGame(ctx.env.DB, {
    pokernowGameId,
    sourceUnit: ledger.unit,
    unitProvenance: provenance,
    startedAt: ledger.startedAt?.getTime() ?? null,
    endedAt: ledger.endedAt?.getTime() ?? null,
    rows: ledger.rows,
    actorLabel: body.actorLabel ?? null,
  });

  return jsonResponse(
    { id: snapshot.game.id, game: snapshot },
    { status: 201, headers: { ...CORS_HEADERS, 'X-Game-Id': snapshot.game.id } }
  );
};
