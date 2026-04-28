/**
 * Parse a PokerNow ledger CSV into a normalized {@link ParsedLedger}.
 *
 * CSV columns (PokerNow as of late 2024/2025):
 *   player_nickname,player_id,session_start_at,session_end_at,buy_in,buy_out,stack,net
 *
 * `buy_in`, `buy_out`, `stack`, `net` are integer cents.
 *
 * Aggregation rules:
 *   - Group by `player_id` (NOT nickname — players can rename mid-session and
 *     can have multiple session segments per game).
 *   - Sum `net` across rows.
 *   - Display name = nickname from the most-recent `session_start_at` row.
 *   - `startedAt` = min(session_start_at), `endedAt` = max(session_end_at).
 */

import Papa from 'papaparse';
import type { LedgerRow, ParsedLedger } from './types';

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

interface Accumulator {
  playerId: string;
  netCents: number;
  buyInCents: number;
  buyOutCents: number;
  // Track the row with the latest session_start_at so we can use its nickname
  // as the display name.
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

export function parseLedgerCsv(csv: string): ParsedLedger {
  // Strip a leading BOM (U+FEFF) if present — common in CSV exports.
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

  for (const row of result.data) {
    const playerId = row.player_id?.trim();
    if (!playerId) {
      throw new LedgerParseError('Row missing player_id');
    }

    const netCents = parseInteger(row.net, 'net');
    const buyInCents = parseInteger(row.buy_in, 'buy_in');
    const buyOutCents = parseInteger(row.buy_out, 'buy_out');
    const stackCents = parseInteger(row.stack, 'stack');
    const startMs = parseDate(row.session_start_at);
    const endMs = parseDate(row.session_end_at);

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
        netCents: 0,
        buyInCents: 0,
        buyOutCents: 0,
        latestStartAt: -Infinity,
        latestNickname: row.player_nickname?.trim() || playerId,
      };
      accumulators.set(playerId, acc);
    }

    acc.netCents += netCents;
    acc.buyInCents += buyInCents;
    // PokerNow's `buy_out` is the player's cashed chips; remaining stack at
    // game end is in `stack`. For total "money out" we want buy_out + stack.
    acc.buyOutCents += buyOutCents + stackCents;

    const candidate = startMs ?? -Infinity;
    if (candidate > acc.latestStartAt) {
      acc.latestStartAt = candidate;
      acc.latestNickname = row.player_nickname?.trim() || acc.latestNickname;
    }
  }

  const rows: LedgerRow[] = Array.from(accumulators.values()).map((acc) => ({
    playerId: acc.playerId,
    nickname: acc.latestNickname,
    netCents: acc.netCents,
    buyInCents: acc.buyInCents,
    buyOutCents: acc.buyOutCents,
  }));

  // Sort by net desc, tiebreak by playerId asc for determinism.
  rows.sort((a, b) => b.netCents - a.netCents || a.playerId.localeCompare(b.playerId));

  return {
    rows,
    startedAt: earliestStart !== null ? new Date(earliestStart) : null,
    endedAt: latestEnd !== null ? new Date(latestEnd) : null,
  };
}

/** True iff the per-player nets sum to zero (within ±$0.01 of slack). */
export function ledgerBalances(rows: LedgerRow[]): { isBalanced: boolean; sumCents: number } {
  const sum = rows.reduce((acc, r) => acc + r.netCents, 0);
  return { isBalanced: Math.abs(sum) <= 1, sumCents: sum };
}
