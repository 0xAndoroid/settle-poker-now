import { encodeHash } from './hashState';
import { formatDollars } from './money';
import { gamePath, liveGamePath } from './routing';
import type { LiveGameSnapshot, ParsedLedger, PersistedGameSnapshot } from './types';

export type RecentGameKind = 'ledger' | 'game' | 'live';
export type RecentGameStatus = 'active' | 'inactive' | 'finalized';

export interface RecentGameEntry {
  kind: RecentGameKind;
  id: string;
  path: string;
  label: string;
  status: RecentGameStatus;
  lastVisitedAt: number;
  missingAt?: number;
}

export type RecentGamesStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const RECENT_GAMES_STORAGE_KEY = 'settle-poker-now:recent-games:v1';
export const RECENT_GAMES_UPDATED_EVENT = 'settle-poker-now:recent-games-updated';
export const RECENT_GAMES_LIMIT = 50;

interface RecentGamesPayload {
  version: 1;
  entries: RecentGameEntry[];
}

export function getRecentGamesStorage(): RecentGamesStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readRecentGames(
  storage: RecentGamesStorage | null = getRecentGamesStorage()
): RecentGameEntry[] {
  if (!storage) return [];
  const raw = safeGet(storage);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    const rows = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.entries)
        ? parsed.entries
        : [];
    return normalizeEntries(rows);
  } catch {
    return [];
  }
}

export function upsertRecentGame(
  storage: RecentGamesStorage | null,
  entry: RecentGameEntry
): RecentGameEntry[] {
  const normalized = normalizeEntry(entry);
  const current = readRecentGames(storage);
  if (!normalized) return current;

  const next = [normalized, ...current.filter((row) => !sameGame(row, normalized))]
    .sort((a, b) => b.lastVisitedAt - a.lastVisitedAt)
    .slice(0, RECENT_GAMES_LIMIT);
  writeRecentGames(storage, next);
  return next;
}

export function removeRecentGame(
  storage: RecentGamesStorage | null,
  kind: RecentGameKind,
  id: string
): RecentGameEntry[] {
  const next = readRecentGames(storage).filter((entry) => entry.kind !== kind || entry.id !== id);
  writeRecentGames(storage, next);
  return next;
}

export function markRecentGameMissing(
  storage: RecentGamesStorage | null,
  kind: RecentGameKind,
  id: string,
  missingAt = Date.now()
): RecentGameEntry[] {
  const current = readRecentGames(storage);
  let changed = false;
  const next = current.map((entry) => {
    if (entry.kind !== kind || entry.id !== id) return entry;
    changed = true;
    return { ...entry, missingAt };
  });
  if (changed) writeRecentGames(storage, next);
  return next;
}

export function buildLedgerRecentGameEntry(args: {
  gameId: string;
  ledger: ParsedLedger;
  visitedAt?: number;
}): RecentGameEntry {
  const visitedAt = args.visitedAt ?? Date.now();
  const playerCount = args.ledger.rows.length;
  const totalBuyInCents = args.ledger.rows.reduce((sum, row) => sum + row.buyInCents, 0);
  const playedAt = args.ledger.startedAt?.getTime() ?? args.ledger.endedAt?.getTime() ?? visitedAt;
  return {
    kind: 'ledger',
    id: args.gameId,
    path: ledgerPath(args.gameId),
    label: gameLabel({
      dateMs: playedAt,
      playerCount,
      amountCents: totalBuyInCents,
      amountLabel: 'buy-in',
      fallback: `Ledger ${args.gameId}`,
    }),
    status: args.ledger.endedAt ? 'inactive' : 'active',
    lastVisitedAt: visitedAt,
  };
}

export function buildPersistedRecentGameEntry(args: {
  snapshot: PersistedGameSnapshot;
  visitedAt?: number;
}): RecentGameEntry {
  const visitedAt = args.visitedAt ?? Date.now();
  const game = args.snapshot.game;
  const totalBuyInCents = args.snapshot.players.reduce(
    (sum, player) => sum + (player.buyInCents ?? 0),
    0
  );
  const note = game.note?.trim() || null;

  return {
    kind: 'game',
    id: game.id,
    path: gamePath(game.id),
    label: gameLabel({
      title: note,
      dateMs: game.startedAt ?? game.createdAt,
      playerCount: args.snapshot.players.length,
      amountCents: totalBuyInCents,
      amountLabel: 'buy-in',
      fallback: `Game ${game.id}`,
    }),
    status: game.finalizedAt === null ? 'inactive' : 'finalized',
    lastVisitedAt: visitedAt,
  };
}

export function buildLiveRecentGameEntry(args: {
  snapshot: LiveGameSnapshot;
  visitedAt?: number;
}): RecentGameEntry {
  const visitedAt = args.visitedAt ?? Date.now();
  const game = args.snapshot.game;
  const totalBuyInCents = args.snapshot.playerSummaries.reduce(
    (sum, player) => sum + player.buyInCents,
    0
  );
  const isActive = game.status === 'active' || game.status === 'finalizing';
  const amountCents = isActive ? args.snapshot.bankSummary.chipsInPlayCents : totalBuyInCents;

  return {
    kind: 'live',
    id: game.id,
    path: liveGamePath(game.id),
    label: gameLabel({
      title: game.title?.trim() || null,
      dateMs: game.createdAt,
      playerCount: args.snapshot.players.length,
      amountCents,
      amountLabel: isActive ? 'in play' : 'buy-in',
      fallback: `Live ${game.id}`,
    }),
    status:
      game.status === 'finalized'
        ? 'finalized'
        : game.status === 'abandoned'
          ? 'inactive'
          : 'active',
    lastVisitedAt: visitedAt,
  };
}

function ledgerPath(gameId: string): string {
  const hash = encodeHash({
    gameId,
    adjustments: [],
    isolations: [],
    aliases: [],
    paymentPreferences: [],
    unitOverride: null,
  });
  return hash ? `/#${hash}` : '/';
}

function gameLabel(args: {
  title?: string | null;
  dateMs: number;
  playerCount: number;
  amountCents: number;
  amountLabel: string;
  fallback: string;
}): string {
  const parts = [
    args.title || formatHistoryDate(args.dateMs) || args.fallback,
    plural(args.playerCount, 'player'),
  ];
  if (args.amountCents > 0) {
    parts.push(`${formatDollars(args.amountCents, { fixedDecimals: false })} ${args.amountLabel}`);
  }
  return parts.join(' · ');
}

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function formatHistoryDate(ms: number): string | null {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(ms));
}

function writeRecentGames(storage: RecentGamesStorage | null, entries: RecentGameEntry[]): void {
  if (!storage) return;
  const payload: RecentGamesPayload = {
    version: 1,
    entries: normalizeEntries(entries),
  };
  try {
    storage.setItem(RECENT_GAMES_STORAGE_KEY, JSON.stringify(payload));
    notifyRecentGamesChanged();
  } catch {
    // Private browsing or quota failures should not block settlement flows.
  }
}

function safeGet(storage: RecentGamesStorage): string | null {
  try {
    return storage.getItem(RECENT_GAMES_STORAGE_KEY);
  } catch {
    return null;
  }
}

function notifyRecentGamesChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(RECENT_GAMES_UPDATED_EVENT));
}

function normalizeEntries(rows: unknown[]): RecentGameEntry[] {
  const seen = new Set<string>();
  const out: RecentGameEntry[] = [];
  for (const row of rows) {
    const entry = normalizeEntry(row);
    if (!entry) continue;
    const key = recentGameKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out.sort((a, b) => b.lastVisitedAt - a.lastVisitedAt).slice(0, RECENT_GAMES_LIMIT);
}

function normalizeEntry(row: unknown): RecentGameEntry | null {
  if (!isRecord(row)) return null;
  if (!isKind(row.kind)) return null;
  if (!isStatus(row.status)) return null;
  if (typeof row.id !== 'string' || row.id.trim().length === 0) return null;
  if (typeof row.path !== 'string' || !row.path.startsWith('/')) return null;
  if (typeof row.label !== 'string' || row.label.trim().length === 0) return null;
  if (typeof row.lastVisitedAt !== 'number' || !Number.isFinite(row.lastVisitedAt)) return null;
  const missingAt =
    typeof row.missingAt === 'number' && Number.isFinite(row.missingAt)
      ? Math.trunc(row.missingAt)
      : undefined;
  return {
    kind: row.kind,
    id: row.id.trim().slice(0, 128),
    path: row.path,
    label: row.label.trim().slice(0, 140),
    status: row.status,
    lastVisitedAt: Math.trunc(row.lastVisitedAt),
    ...(missingAt === undefined ? {} : { missingAt }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isKind(value: unknown): value is RecentGameKind {
  return value === 'ledger' || value === 'game' || value === 'live';
}

function isStatus(value: unknown): value is RecentGameStatus {
  return value === 'active' || value === 'inactive' || value === 'finalized';
}

function sameGame(a: RecentGameEntry, b: RecentGameEntry): boolean {
  return a.kind === b.kind && a.id === b.id;
}

function recentGameKey(entry: RecentGameEntry): string {
  return `${entry.kind}:${entry.id}`;
}
