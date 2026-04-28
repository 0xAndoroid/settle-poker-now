/**
 * Parse a PokerNow ledger CSV into a normalized {@link ParsedLedger}.
 *
 * CSV columns (PokerNow as of late 2024/2025):
 *   player_nickname,player_id,session_start_at,session_end_at,buy_in,buy_out,stack,net
 *
 * Numeric columns may be reported in either CENTS or DOLLARS depending on
 * whether the host enabled "cents" in the game settings:
 *   - cents-mode: `100` means $1.00, a `$50` buy-in shows as `5000`.
 *   - dollars-mode: `100` means $100,  a `$50` buy-in shows as `50`.
 *
 * Internally everything is normalized to integer cents (×100 for
 * dollars-mode input). The unit is determined in this priority order:
 *   1. Explicit override passed by the caller.
 *   2. Authoritative hint from PokerNow (e.g. via the worker, fed in as
 *      the same `unit` argument).
 *   3. Heuristic inference based on value magnitudes (see {@link inferUnit}).
 *
 * Aggregation rules:
 *   - Group by `player_id` (NOT nickname — players can rename mid-session
 *     and have multiple session segments per game).
 *   - Sum `net` across rows.
 *   - Display name = nickname from the most-recent `session_start_at` row.
 *   - `startedAt` = min(session_start_at), `endedAt` = max(session_end_at).
 */

import Papa from 'papaparse';
import type { LedgerRow, LedgerUnit, ParsedLedger } from './types';

interface RawRow {
  player_nickname: string;
  player_id: string;
  session_start_at: string;
  session_end_at: string;
  buy_in: string;
  buy_out: string;
  stack: string;
  net: string;
}

const REQUIRED_COLS = [
  'player_nickname',
  'player_id',
  'session_start_at',
  'session_end_at',
  'net',
] as const;

// U+FEFF byte-order mark — Excel and several CSV exporters prepend it.
const BOM = String.fromCharCode(0xfeff);

/**
 * Threshold above which a value MUST be cents (because it would imply an
 * unreasonable dollar amount in dollars-mode). $2000 is the chosen cutoff:
 *   - cents-mode: 2000 = $20.00 — completely ordinary.
 *   - dollars-mode: 2000 = $2000 — uncommon for a home game.
 *
 * In ambiguous regions (all values < 2000), we lean dollars-mode because
 * dollars-mode is the breakage-causing case the user reported. Cents-mode
 * games at sub-$20 totals are vanishingly rare in practice.
 */
const CENTS_INFERENCE_THRESHOLD = 2000;

interface Accumulator {
  playerId: string;
  /** Raw native value (cents OR dollars) — converted to cents at the end. */
  netRaw: number;
  buyInRaw: number;
  buyOutRaw: number;
  latestStartAt: number;
  latestNickname: string;
}

export class LedgerParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerParseError';
  }
}

function parseInteger(value: string | undefined, field: string): number {
  if (value == null || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new LedgerParseError(`Invalid ${field}: "${value}"`);
  }
  return Math.trunc(n);
}

function parseDate(value: string | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

/**
 * Heuristic unit detection. Examines all raw `buy_in`, `buy_out`, `stack`,
 * and `net` magnitudes; if any exceed {@link CENTS_INFERENCE_THRESHOLD},
 * the values are in cents (because dollars-mode at that magnitude would
 * imply a $2000+ home game). Otherwise the game is in dollars-mode.
 *
 * Edge cases:
 *   - All values zero → defaults to cents-mode (matches the
 *     longstanding default and is harmless: 0 × 100 = 0).
 *   - Returns the inferred unit only; the caller decides how to combine
 *     with any authoritative hint.
 */
export function inferUnit(rawValues: readonly number[]): LedgerUnit {
  let maxAbs = 0;
  for (const v of rawValues) {
    const a = Math.abs(v);
    if (a > maxAbs) maxAbs = a;
  }
  if (maxAbs >= CENTS_INFERENCE_THRESHOLD) return 'cents';
  return 'dollars';
}

export interface ParseLedgerOptions {
  /**
   * Explicit unit override. When provided, the heuristic is skipped and
   * `unitWasInferred` will be `false` in the returned ledger.
   */
  unit?: LedgerUnit;
}

export function parseLedgerCsv(
  csv: string,
  options: ParseLedgerOptions = {}
): ParsedLedger {
  const trimmed = (csv.startsWith(BOM) ? csv.slice(BOM.length) : csv).trim();
  if (!trimmed) throw new LedgerParseError('Ledger CSV is empty');

  const result = Papa.parse<RawRow>(trimmed, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });

  if (result.errors.length > 0) {
    const first = result.errors[0]!;
    throw new LedgerParseError(`CSV parse error at row ${first.row}: ${first.message}`);
  }
  if (result.data.length === 0) {
    throw new LedgerParseError('Ledger CSV has no data rows');
  }

  const fields = result.meta.fields ?? [];
  for (const required of REQUIRED_COLS) {
    if (!fields.includes(required)) {
      throw new LedgerParseError(`Missing required column "${required}" in ledger CSV`);
    }
  }

  const accumulators = new Map<string, Accumulator>();
  let earliestStart: number | null = null;
  let latestEnd: number | null = null;

  // Collect every numeric magnitude we see, so the heuristic has a wide
  // base to work with.
  const allMagnitudes: number[] = [];

  for (const row of result.data) {
    const playerId = row.player_id?.trim();
    if (!playerId) {
      throw new LedgerParseError('Row missing player_id');
    }

    const netRaw = parseInteger(row.net, 'net');
    const buyInRaw = parseInteger(row.buy_in, 'buy_in');
    const buyOutRaw = parseInteger(row.buy_out, 'buy_out');
    const stackRaw = parseInteger(row.stack, 'stack');
    const startMs = parseDate(row.session_start_at);
    const endMs = parseDate(row.session_end_at);

    allMagnitudes.push(netRaw, buyInRaw, buyOutRaw, stackRaw);

    if (startMs !== null) {
      earliestStart = earliestStart === null ? startMs : Math.min(earliestStart, startMs);
    }
    if (endMs !== null) {
      latestEnd = latestEnd === null ? endMs : Math.max(latestEnd, endMs);
    }

    let acc = accumulators.get(playerId);
    if (!acc) {
      acc = {
        playerId,
        netRaw: 0,
        buyInRaw: 0,
        buyOutRaw: 0,
        latestStartAt: -Infinity,
        latestNickname: row.player_nickname?.trim() || playerId,
      };
      accumulators.set(playerId, acc);
    }

    acc.netRaw += netRaw;
    acc.buyInRaw += buyInRaw;
    // PokerNow's `buy_out` is cashed chips; remaining `stack` at game end
    // is separate. Total "money out" = buy_out + stack.
    acc.buyOutRaw += buyOutRaw + stackRaw;

    const candidate = startMs ?? -Infinity;
    if (candidate > acc.latestStartAt) {
      acc.latestStartAt = candidate;
      acc.latestNickname = row.player_nickname?.trim() || acc.latestNickname;
    }
  }

  const unit: LedgerUnit = options.unit ?? inferUnit(allMagnitudes);
  const unitWasInferred = options.unit === undefined;
  const multiplier = unit === 'dollars' ? 100 : 1;

  const rows: LedgerRow[] = Array.from(accumulators.values()).map((acc) => ({
    playerId: acc.playerId,
    nickname: acc.latestNickname,
    netCents: acc.netRaw * multiplier,
    buyInCents: acc.buyInRaw * multiplier,
    buyOutCents: acc.buyOutRaw * multiplier,
  }));

  // Sort by net desc, tiebreak by playerId asc for determinism.
  rows.sort((a, b) => b.netCents - a.netCents || a.playerId.localeCompare(b.playerId));

  return {
    rows,
    startedAt: earliestStart !== null ? new Date(earliestStart) : null,
    endedAt: latestEnd !== null ? new Date(latestEnd) : null,
    unit,
    unitWasInferred,
  };
}

/** True iff the per-player nets sum to zero (within ±$0.01 of slack). */
export function ledgerBalances(rows: LedgerRow[]): { isBalanced: boolean; sumCents: number } {
  const sum = rows.reduce((acc, r) => acc + r.netCents, 0);
  return { isBalanced: Math.abs(sum) <= 1, sumCents: sum };
}
