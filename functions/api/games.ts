/**
 * POST /api/games
 *
 * Two creation modes — both go through the same endpoint:
 *
 *   1. **Legacy (no body.finalize):** body = { pokernowUrl, actorLabel? }.
 *      Fetches the PokerNow ledger, parses, snapshots to D1 with no
 *      modifications. Game is left UN-finalized. This path remains so
 *      old demo links keep working; nothing in the new UI calls it.
 *
 *   2. **Finalize-on-create (body.finalize === true):** body = {
 *        pokernowUrl, actorLabel?, finalize: true,
 *        adjustments?, isolations?, aliases?
 *      }.
 *      Same fetch + parse, but seeds the modifications and computes the
 *      final settlement plan in one D1 batch with `finalized_at` set
 *      at insert time. This is the only flow the post-rewire UI uses
 *      (clicked from the `[ FINALIZE › ]` button on the ephemeral view).
 *
 * The Pokernow URL is still re-fetched on the server even when the client
 * has the ledger in memory — the worker is the source of truth for the
 * ledger CSV (cents-mode detection is more reliable here, and we don't
 * want clients to lie about the player nets).
 */

import { parseLedgerCsv } from '../../src/lib/csv';
import { extractGameId } from '../../src/lib/pokernow';
import {
  CreateFinalizedValidationError,
  createGame,
  createGameFinalized,
} from '../lib/db';
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

interface AdjustmentBody {
  fromPlayerId: string;
  toPlayerId: string;
  amountCents: number;
}

interface IsolationBody {
  playerId: string;
  counterpartId: string;
}

interface AliasBody {
  playerId: string;
  aliasToPlayerId: string;
}

interface CreateBody {
  pokernowUrl?: string;
  actorLabel?: string;
  /** Set to `true` to finalize-on-create. */
  finalize?: boolean;
  adjustments?: AdjustmentBody[];
  isolations?: IsolationBody[];
  aliases?: AliasBody[];
  /**
   * Free-text per-game note (Venmo deep-link `note=` param). Optional —
   * the UI falls back to "dinner" when null/empty.
   */
  note?: string | null;
}

function isValidAdjustment(x: unknown): x is AdjustmentBody {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.fromPlayerId === 'string' &&
    typeof o.toPlayerId === 'string' &&
    typeof o.amountCents === 'number' &&
    Number.isFinite(o.amountCents)
  );
}

function isValidIsolation(x: unknown): x is IsolationBody {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return typeof o.playerId === 'string' && typeof o.counterpartId === 'string';
}

function isValidAlias(x: unknown): x is AliasBody {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.playerId === 'string' && typeof o.aliasToPlayerId === 'string'
  );
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

  const finalize = body.finalize === true;
  const adjustments = body.adjustments ?? [];
  const isolations = body.isolations ?? [];
  const aliases = body.aliases ?? [];

  if (finalize) {
    if (!Array.isArray(adjustments) || !adjustments.every(isValidAdjustment)) {
      return errorResponse(400, 'adjustments must be a list of {fromPlayerId,toPlayerId,amountCents}.');
    }
    if (!Array.isArray(isolations) || !isolations.every(isValidIsolation)) {
      return errorResponse(400, 'isolations must be a list of {playerId,counterpartId}.');
    }
    if (!Array.isArray(aliases) || !aliases.every(isValidAlias)) {
      return errorResponse(400, 'aliases must be a list of {playerId,aliasToPlayerId}.');
    }
  }

  const fetched = await fetchLedger(pokernowGameId, ctx);
  if (!fetched.ok) return fetched.response;
  const { ledger, provenance } = fetched;

  if (ledger.rows.length === 0) {
    return errorResponse(422, 'Ledger has no players.');
  }

  const note = typeof body.note === 'string' ? body.note : null;

  if (finalize) {
    try {
      const snapshot = await createGameFinalized(ctx.env.DB, {
        pokernowGameId,
        sourceUnit: ledger.unit,
        unitProvenance: provenance,
        startedAt: ledger.startedAt?.getTime() ?? null,
        endedAt: ledger.endedAt?.getTime() ?? null,
        rows: ledger.rows,
        adjustments,
        isolations,
        aliases,
        actorLabel: body.actorLabel ?? null,
        note,
      });
      return jsonResponse(
        { id: snapshot.game.id, game: snapshot },
        { status: 201, headers: { ...CORS_HEADERS, 'X-Game-Id': snapshot.game.id } }
      );
    } catch (err) {
      if (err instanceof CreateFinalizedValidationError) {
        return errorResponse(400, err.message);
      }
      throw err;
    }
  }

  const snapshot = await createGame(ctx.env.DB, {
    pokernowGameId,
    sourceUnit: ledger.unit,
    unitProvenance: provenance,
    startedAt: ledger.startedAt?.getTime() ?? null,
    endedAt: ledger.endedAt?.getTime() ?? null,
    rows: ledger.rows,
    actorLabel: body.actorLabel ?? null,
    note,
  });

  return jsonResponse(
    { id: snapshot.game.id, game: snapshot },
    { status: 201, headers: { ...CORS_HEADERS, 'X-Game-Id': snapshot.game.id } }
  );
};

/* ──────── Helpers ──────── */

interface FetchOk {
  ok: true;
  ledger: ReturnType<typeof parseLedgerCsv>;
  provenance: 'header' | 'heuristic';
}

interface FetchErr {
  ok: false;
  response: Response;
}

/**
 * Resolve the ledger CSV for `pokernowGameId`. Handles the demo bootstrap
 * (asset-bound `demo-ledger.csv`) and the upstream PokerNow fetch.
 */
async function fetchLedger(
  pokernowGameId: string,
  ctx: { env: Env; request: Request }
): Promise<FetchOk | FetchErr> {
  if (pokernowGameId === 'demo') {
    const demoUrl = new URL('/demo-ledger.csv', ctx.request.url);
    const demo = await ctx.env.ASSETS.fetch(demoUrl);
    if (!demo.ok) {
      return {
        ok: false,
        response: errorResponse(500, 'Demo fixture missing.'),
      };
    }
    const demoCsv = await demo.text();
    return {
      ok: true,
      ledger: parseLedgerCsv(demoCsv, { unit: 'cents' }),
      provenance: 'header',
    };
  }

  const [csvResult, centsMode] = await Promise.all([
    fetchLedgerCsv(pokernowGameId),
    detectCentsMode(pokernowGameId),
  ]);
  if (csvResult.status !== 200 || !csvResult.csv) {
    if (csvResult.status === 404) {
      return {
        ok: false,
        response: errorResponse(404, `No ledger found for "${pokernowGameId}".`),
      };
    }
    return {
      ok: false,
      response: errorResponse(
        csvResult.status,
        `Couldn't reach PokerNow (HTTP ${csvResult.status}). ${csvResult.errorBody?.slice(0, 240) ?? ''}`
      ),
    };
  }

  const unitFromHeader =
    centsMode === true ? 'cents' : centsMode === false ? 'dollars' : null;

  if (unitFromHeader) {
    return {
      ok: true,
      ledger: parseLedgerCsv(csvResult.csv, { unit: unitFromHeader }),
      provenance: 'header',
    };
  }
  return {
    ok: true,
    ledger: parseLedgerCsv(csvResult.csv),
    provenance: 'heuristic',
  };
}
