/**
 * D1 access layer for persistent games.
 *
 * Schema lives in `migrations/0001_initial.sql`. Every public function in
 * this module wraps prepared statements + binds parameters to keep the API
 * straightforward at the call site. All money lives in integer cents.
 *
 * Concurrency notes:
 *   - D1 is SQLite under the hood; multi-statement transactions go through
 *     `db.batch([...])` which executes atomically.
 *   - The settlement plan is re-derived after every mutation that affects
 *     adjustments or isolation rules. Existing `payments` rows are matched
 *     by (from_player_id, to_player_id, amount_cents) and their completion
 *     state is preserved across re-derivation.
 */

import {
  applyAdjustments,
  buildSettlementPlan,
} from '../../src/lib/settle';
import {
  buildCanonicalMap,
  canonicalize,
  collapseAdjustments,
  collapseIsolations,
  collapseRows,
} from '../../src/lib/aliases';
import type {
  Adjustment,
  IsolationRule,
  LedgerRow,
  LedgerUnit,
  PaymentPreference,
  SourceKind,
  SettlementPlan,
  SettlementTxn,
} from '../../src/lib/types';

/* ──────── Types ──────── */

export type UnitProvenance = 'header' | 'heuristic' | 'user';

export interface DbGame {
  id: string;
  pokernowGameId: string;
  sourceKind: SourceKind;
  sourceUnit: LedgerUnit;
  unitProvenance: UnitProvenance;
  startedAt: number | null;
  endedAt: number | null;
  createdAt: number;
  updatedAt: number;
  /** ms since epoch when the game was finalized; null when still editable. */
  finalizedAt: number | null;
  /** Actor label of whoever finalized; null when not finalized. */
  finalizedBy: string | null;
  /**
   * Free-text per-game note. Used as the Venmo deep-link `note=` param
   * and surfaced in the persistent UI. Null = unset; the application
   * layer falls back to "dinner".
   */
  note: string | null;
}

export interface DbPlayer {
  playerId: string;
  nickname: string;
  netCents: number;
  buyInCents?: number | null;
  buyOutCents?: number | null;
}

export interface DbPayment {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  amountCents: number;
  forced: boolean;
  position: number;
  completedAt: number | null;
  completedBy: string | null;
}

export interface DbAdjustment {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  amountCents: number;
  createdAt: number;
  createdBy: string | null;
}

export interface DbIsolation {
  playerId: string;
  counterpartId: string;
  createdAt: number;
}

export interface DbAlias {
  /** The duplicate player_id (folded out of the active roster). */
  playerId: string;
  /** Canonical target — chain-compressed on write so this never references another aliased player. */
  aliasToPlayerId: string;
  createdAt: number;
  createdBy: string | null;
}

export interface DbPaymentMethod {
  playerId: string;
  /** Without leading '@'. */
  venmoUsername: string | null;
  /**
   * Free-text Zelle handle — email, US phone, anything Zelle will accept.
   * The user pastes whatever their bank app expects; we don't try to
   * discriminate (it caused fiddly UI in the identity prompt).
   */
  zelleHandle: string | null;
  updatedAt: number;
  updatedBy: string | null;
}

export interface DbAuditEntry {
  id: string;
  action: AuditAction;
  actorLabel: string | null;
  payload: unknown;
  createdAt: number;
}

export type AuditAction =
  | 'create_game'
  | 'complete_payment'
  | 'reopen_payment'
  | 'add_adjustment'
  | 'remove_adjustment'
  | 'set_isolation'
  | 'clear_isolation'
  | 'add_alias'
  | 'remove_alias'
  | 'finalize'
  | 'unfinalize'
  | 'set_payment_methods'
  | 'set_note';

export interface DbGameSnapshot {
  game: DbGame;
  players: DbPlayer[];
  payments: DbPayment[];
  adjustments: DbAdjustment[];
  isolations: DbIsolation[];
  aliases: DbAlias[];
  paymentMethods: DbPaymentMethod[];
  audit: DbAuditEntry[];
}

/* ──────── Note normalisation ──────── */

const NOTE_MAX_LENGTH = 80;

/**
 * Trim, cap to 80 chars, and collapse to null when empty. Matches the
 * Venmo `note=` query-param size budget — Venmo silently truncates very
 * long notes; we cap here so audit payloads + UI displays stay tidy.
 */
function normalizeNote(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, NOTE_MAX_LENGTH);
}

/* ──────── Slug generation ──────── */

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'; // base32, no 1/i/l/o/u to avoid confusion

/**
 * Cryptographically random 8-character base32 slug. Collision probability
 * for one game is ≈ 1 / 32^8 = 1 / 1.1×10^12 — fine for the lifetime of
 * this app. Caller may retry on UNIQUE conflict (insert is the boundary).
 */
export function newGameSlug(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

export function newId(prefix = ''): string {
  return `${prefix}${crypto.randomUUID()}`;
}

/* ──────── Read helpers ──────── */

function rowToGame(row: Record<string, unknown>): DbGame {
  return {
    id: row.id as string,
    pokernowGameId: row.pokernow_game_id as string,
    sourceKind: (row.source_kind as SourceKind | undefined) ?? 'pokernow',
    sourceUnit: row.source_unit as LedgerUnit,
    unitProvenance: row.unit_provenance as UnitProvenance,
    startedAt: (row.started_at as number | null) ?? null,
    endedAt: (row.ended_at as number | null) ?? null,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
    finalizedAt: (row.finalized_at as number | null) ?? null,
    finalizedBy: (row.finalized_by as string | null) ?? null,
    note: (row.note as string | null) ?? null,
  };
}

function rowToPlayer(row: Record<string, unknown>): DbPlayer {
  return {
    playerId: row.player_id as string,
    nickname: row.nickname as string,
    netCents: row.net_cents as number,
    buyInCents: (row.buy_in_cents as number | null | undefined) ?? null,
    buyOutCents: (row.buy_out_cents as number | null | undefined) ?? null,
  };
}

function rowToPayment(row: Record<string, unknown>): DbPayment {
  return {
    id: row.id as string,
    fromPlayerId: row.from_player_id as string,
    toPlayerId: row.to_player_id as string,
    amountCents: row.amount_cents as number,
    forced: (row.forced as number) === 1,
    position: row.position as number,
    completedAt: (row.completed_at as number | null) ?? null,
    completedBy: (row.completed_by as string | null) ?? null,
  };
}

function rowToAdjustment(row: Record<string, unknown>): DbAdjustment {
  return {
    id: row.id as string,
    fromPlayerId: row.from_player_id as string,
    toPlayerId: row.to_player_id as string,
    amountCents: row.amount_cents as number,
    createdAt: row.created_at as number,
    createdBy: (row.created_by as string | null) ?? null,
  };
}

function rowToIsolation(row: Record<string, unknown>): DbIsolation {
  return {
    playerId: row.player_id as string,
    counterpartId: row.counterpart_id as string,
    createdAt: row.created_at as number,
  };
}

function rowToAlias(row: Record<string, unknown>): DbAlias {
  return {
    playerId: row.player_id as string,
    aliasToPlayerId: row.alias_to_player_id as string,
    createdAt: row.created_at as number,
    createdBy: (row.created_by as string | null) ?? null,
  };
}

function rowToPaymentMethod(row: Record<string, unknown>): DbPaymentMethod {
  return {
    playerId: row.player_id as string,
    venmoUsername: (row.venmo_username as string | null) ?? null,
    zelleHandle: (row.zelle_handle as string | null) ?? null,
    updatedAt: row.updated_at as number,
    updatedBy: (row.updated_by as string | null) ?? null,
  };
}

function rowToAudit(row: Record<string, unknown>): DbAuditEntry {
  let parsed: unknown = {};
  try {
    parsed = JSON.parse((row.payload as string) ?? '{}');
  } catch {
    parsed = {};
  }
  return {
    id: row.id as string,
    action: row.action as AuditAction,
    actorLabel: (row.actor_label as string | null) ?? null,
    payload: parsed,
    createdAt: row.created_at as number,
  };
}

/* ──────── Game queries ──────── */

export async function loadGame(db: D1Database, id: string): Promise<DbGameSnapshot | null> {
  const game = await db
    .prepare('SELECT * FROM games WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!game) return null;

  // Fan out to all related queries in parallel.
  const [
    playersRes,
    paymentsRes,
    adjustmentsRes,
    isolationsRes,
    aliasesRes,
    paymentMethodsRes,
    auditRes,
  ] = await Promise.all([
    db.prepare('SELECT * FROM players WHERE game_id = ?').bind(id).all<Record<string, unknown>>(),
    db
      .prepare('SELECT * FROM payments WHERE game_id = ? ORDER BY position ASC')
      .bind(id)
      .all<Record<string, unknown>>(),
    db
      .prepare('SELECT * FROM adjustments WHERE game_id = ? ORDER BY created_at ASC')
      .bind(id)
      .all<Record<string, unknown>>(),
    db
      .prepare('SELECT * FROM isolation_rules WHERE game_id = ? ORDER BY created_at ASC')
      .bind(id)
      .all<Record<string, unknown>>(),
    db
      .prepare('SELECT * FROM player_aliases WHERE game_id = ? ORDER BY created_at ASC')
      .bind(id)
      .all<Record<string, unknown>>(),
    db
      .prepare('SELECT * FROM player_payment_methods WHERE game_id = ?')
      .bind(id)
      .all<Record<string, unknown>>(),
    db
      .prepare(
        'SELECT * FROM audit_log WHERE game_id = ? ORDER BY created_at DESC LIMIT 50'
      )
      .bind(id)
      .all<Record<string, unknown>>(),
  ]);

  return {
    game: rowToGame(game),
    players: (playersRes.results ?? []).map(rowToPlayer),
    payments: (paymentsRes.results ?? []).map(rowToPayment),
    adjustments: (adjustmentsRes.results ?? []).map(rowToAdjustment),
    isolations: (isolationsRes.results ?? []).map(rowToIsolation),
    aliases: (aliasesRes.results ?? []).map(rowToAlias),
    paymentMethods: (paymentMethodsRes.results ?? []).map(rowToPaymentMethod),
    audit: (auditRes.results ?? []).map(rowToAudit),
  };
}

export async function loadGameRow(db: D1Database, id: string): Promise<DbGame | null> {
  const row = await db
    .prepare('SELECT * FROM games WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  return row ? rowToGame(row) : null;
}

/* ──────── Game creation ──────── */

interface CreateGameInput {
  pokernowGameId: string;
  sourceUnit: LedgerUnit;
  unitProvenance: UnitProvenance;
  startedAt: number | null;
  endedAt: number | null;
  rows: LedgerRow[];
  actorLabel?: string | null;
  /** Free-text per-game note (Venmo `note=` param). Null = use fallback. */
  note?: string | null;
}

/**
 * Create a new persistent game record. Tries up to 4 slug candidates if a
 * collision occurs. Computes the initial settlement plan with no
 * adjustments / isolations (they can be added later via mutation routes).
 */
export async function createGame(
  db: D1Database,
  input: CreateGameInput
): Promise<DbGameSnapshot> {
  const now = Date.now();

  // Build the EffectiveBalance list once for the initial plan.
  const balances = applyAdjustments(input.rows, []);
  const initialPlan = buildSettlementPlan(balances, []);

  for (let attempt = 0; attempt < 4; attempt++) {
    const id = newGameSlug();
    const stmts: D1PreparedStatement[] = [];

    stmts.push(
      db
        .prepare(
          `INSERT INTO games (id, pokernow_game_id, source_kind, source_unit, unit_provenance, started_at, ended_at, created_at, updated_at, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          input.pokernowGameId,
          'pokernow',
          input.sourceUnit,
          input.unitProvenance,
          input.startedAt,
          input.endedAt,
          now,
          now,
          normalizeNote(input.note ?? null)
        )
    );

    for (const row of input.rows) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO players (game_id, player_id, nickname, net_cents, buy_in_cents, buy_out_cents)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .bind(
            id,
            row.playerId,
            row.nickname,
            row.netCents,
            row.buyInCents,
            row.buyOutCents
          )
      );
    }

    let position = 0;
    for (const txn of initialPlan.txns) {
      const paymentId = newId('p_');
      stmts.push(
        db
          .prepare(
            `INSERT INTO payments
              (id, game_id, from_player_id, to_player_id, amount_cents, forced, position, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            paymentId,
            id,
            txn.fromId,
            txn.toId,
            txn.amountCents,
            txn.forced ? 1 : 0,
            position++,
            now
          )
      );
    }

    stmts.push(
      auditStmt(db, {
        gameId: id,
        action: 'create_game',
        actorLabel: input.actorLabel ?? null,
        payload: {
          pokernowGameId: input.pokernowGameId,
          sourceUnit: input.sourceUnit,
          unitProvenance: input.unitProvenance,
          playerCount: input.rows.length,
          paymentCount: initialPlan.txns.length,
        },
        createdAt: now,
      })
    );

    try {
      await db.batch(stmts);
    } catch (err) {
      // Slug collision is the only realistic failure here. Retry with a new slug.
      const message = (err as Error).message ?? '';
      if (/UNIQUE.*games\.id/i.test(message) || /UNIQUE.*PRIMARY/i.test(message)) {
        continue;
      }
      throw err;
    }

    const snapshot = await loadGame(db, id);
    if (!snapshot) {
      throw new Error('Game inserted but vanished — broken D1?');
    }
    return snapshot;
  }

  throw new Error('Could not allocate a unique slug after 4 attempts');
}

/**
 * Atomic create-with-modifications-and-finalize.
 *
 * Snapshot-mints a finalized D1 game from an ephemeral edit session. All
 * the work happens in one D1 batch:
 *   1. Allocate slug
 *   2. Insert games (with `finalized_at` set), players, adjustments,
 *      isolations, aliases (canonicalized), payments (final plan), audit.
 *
 * The settlement plan is computed in-memory from the bundle — same pipeline
 * the client + server `rederivePlan` uses, so the persisted plan matches
 * what the user saw before clicking finalize. Validation:
 *   - all adjustment / isolation / alias playerIds must exist in `rows`
 *   - aliases canonicalize-on-write (no chains, no cycles)
 *   - amounts > 0
 *
 * Returns the full snapshot (including the freshly-set `finalizedAt`).
 */
export class CreateFinalizedValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CreateFinalizedValidationError';
  }
}

export interface InsertFinalizedGameSnapshotInput {
  id?: string;
  sourceKind: SourceKind;
  sourceRef: string;
  sourceUnit: LedgerUnit;
  unitProvenance: UnitProvenance;
  startedAt: number | null;
  endedAt: number | null;
  rows: ReadonlyArray<LedgerRow>;
  adjustments: ReadonlyArray<{
    fromPlayerId: string;
    toPlayerId: string;
    amountCents: number;
  }>;
  isolations: ReadonlyArray<{ playerId: string; counterpartId: string }>;
  aliases: ReadonlyArray<{ playerId: string; aliasToPlayerId: string }>;
  paymentPreferences?: ReadonlyArray<PaymentPreference>;
  actorLabel: string | null;
  note?: string | null;
}

export async function createGameFinalized(
  db: D1Database,
  input: {
    pokernowGameId: string;
    sourceUnit: LedgerUnit;
    unitProvenance: UnitProvenance;
    startedAt: number | null;
    endedAt: number | null;
    rows: LedgerRow[];
    adjustments: ReadonlyArray<{
      fromPlayerId: string;
      toPlayerId: string;
      amountCents: number;
    }>;
    isolations: ReadonlyArray<{ playerId: string; counterpartId: string }>;
    aliases: ReadonlyArray<{ playerId: string; aliasToPlayerId: string }>;
    paymentPreferences?: ReadonlyArray<PaymentPreference>;
    actorLabel: string | null;
    note?: string | null;
  }
): Promise<DbGameSnapshot> {
  return insertFinalizedGameSnapshot(db, {
    sourceKind: 'pokernow',
    sourceRef: input.pokernowGameId,
    sourceUnit: input.sourceUnit,
    unitProvenance: input.unitProvenance,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    rows: input.rows,
    adjustments: input.adjustments,
    isolations: input.isolations,
    aliases: input.aliases,
    paymentPreferences: input.paymentPreferences,
    actorLabel: input.actorLabel,
    note: input.note,
  });
}

export async function insertFinalizedGameSnapshot(
  db: D1Database,
  input: InsertFinalizedGameSnapshotInput
): Promise<DbGameSnapshot> {
  const rows = input.rows.slice();
  const playerIds = new Set(rows.map((r) => r.playerId));
  for (const a of input.adjustments) {
    if (!playerIds.has(a.fromPlayerId) || !playerIds.has(a.toPlayerId)) {
      throw new CreateFinalizedValidationError(
        `Adjustment references unknown player.`
      );
    }
    if (a.fromPlayerId === a.toPlayerId) {
      throw new CreateFinalizedValidationError(
        'Adjustment from and to must differ.'
      );
    }
    if (!Number.isFinite(a.amountCents) || a.amountCents <= 0) {
      throw new CreateFinalizedValidationError(
        'Adjustment amount must be a positive integer.'
      );
    }
  }
  for (const r of input.isolations) {
    if (!playerIds.has(r.playerId) || !playerIds.has(r.counterpartId)) {
      throw new CreateFinalizedValidationError(
        `Isolation rule references unknown player.`
      );
    }
    if (r.playerId === r.counterpartId) {
      throw new CreateFinalizedValidationError(
        'Player cannot be isolated to themselves.'
      );
    }
  }
  const paymentPreferences = input.paymentPreferences ?? [];
  const seenPaymentPreferencePlayers = new Set<string>();
  for (const preference of paymentPreferences) {
    if (!playerIds.has(preference.playerId)) {
      throw new CreateFinalizedValidationError(
        `Payment preference references unknown player.`
      );
    }
    if (preference.rail !== 'venmo' && preference.rail !== 'zelle') {
      throw new CreateFinalizedValidationError(
        'Payment preference rail must be venmo or zelle.'
      );
    }
    if (seenPaymentPreferencePlayers.has(preference.playerId)) {
      throw new CreateFinalizedValidationError(
        'Each player can have only one payment preference.'
      );
    }
    seenPaymentPreferencePlayers.add(preference.playerId);
  }
  // Canonicalize aliases (compress chains, reject cycles).
  const proposed = new Map<string, string>();
  for (const a of input.aliases) {
    if (!playerIds.has(a.playerId) || !playerIds.has(a.aliasToPlayerId)) {
      throw new CreateFinalizedValidationError(
        `Alias references unknown player.`
      );
    }
    if (a.playerId === a.aliasToPlayerId) {
      throw new CreateFinalizedValidationError(
        'Player cannot be aliased to themselves.'
      );
    }
    proposed.set(a.playerId, a.aliasToPlayerId);
  }
  const canonAliases: { playerId: string; aliasToPlayerId: string }[] = [];
  for (const [src] of proposed) {
    const target = canonicalize(proposed.get(src)!, proposed);
    if (target === null) {
      throw new CreateFinalizedValidationError(
        'Aliases form a cycle — refusing to finalize.'
      );
    }
    if (target === src) {
      throw new CreateFinalizedValidationError(
        `Alias for "${src}" collapses back to itself.`
      );
    }
    canonAliases.push({ playerId: src, aliasToPlayerId: target });
  }

  // Compute the final plan in-memory using the same pipeline as
  // `rederivePlan`. Mirrors `computePlan` in src/lib/settle.ts.
  const canonicalMap = buildCanonicalMap(canonAliases);
  const collapsedRows = collapseRows(rows, canonicalMap);
  const collapsedAdjustments = collapseAdjustments(
    input.adjustments.map((a, i) => ({
      id: `seed_${i}`,
      fromId: a.fromPlayerId,
      toId: a.toPlayerId,
      amountCents: a.amountCents,
    })),
    canonicalMap
  );
  const { rules: collapsedIsolations } = collapseIsolations(
    input.isolations.map((r) => ({
      playerId: r.playerId,
      counterpartId: r.counterpartId,
    })),
    canonicalMap
  );
  const collapsedPaymentPreferences: PaymentPreference[] = [];
  const seenCollapsedPaymentPreferencePlayers = new Set<string>();
  for (const preference of paymentPreferences) {
    const playerId = canonicalMap.get(preference.playerId) ?? preference.playerId;
    if (seenCollapsedPaymentPreferencePlayers.has(playerId)) continue;
    seenCollapsedPaymentPreferencePlayers.add(playerId);
    collapsedPaymentPreferences.push({ playerId, rail: preference.rail });
  }
  const balances = applyAdjustments(collapsedRows, collapsedAdjustments);
  const plan = buildSettlementPlan(
    balances,
    collapsedIsolations,
    collapsedPaymentPreferences
  );

  const now = Date.now();
  const maxAttempts = input.id ? 5 : 4;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const id = attempt === 0 && input.id ? input.id : newGameSlug();
    const stmts: D1PreparedStatement[] = [];

    // games row — finalized at creation time.
    stmts.push(
      db
        .prepare(
          `INSERT INTO games
            (id, pokernow_game_id, source_kind, source_unit, unit_provenance, started_at, ended_at, created_at, updated_at, finalized_at, finalized_by, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          input.sourceRef,
          input.sourceKind,
          input.sourceUnit,
          input.unitProvenance,
          input.startedAt,
          input.endedAt,
          now,
          now,
          now,
          input.actorLabel,
          normalizeNote(input.note ?? null)
        )
    );

    // players
    for (const row of rows) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO players (game_id, player_id, nickname, net_cents, buy_in_cents, buy_out_cents)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .bind(
            id,
            row.playerId,
            row.nickname,
            row.netCents,
            row.buyInCents,
            row.buyOutCents
          )
      );
    }

    // adjustments
    for (const a of input.adjustments) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO adjustments (id, game_id, from_player_id, to_player_id, amount_cents, created_at, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            newId('a_'),
            id,
            a.fromPlayerId,
            a.toPlayerId,
            Math.trunc(a.amountCents),
            now,
            input.actorLabel
          )
      );
    }

    // isolation rules — one per player, last-write-wins
    const seenIso = new Set<string>();
    for (const r of input.isolations) {
      if (seenIso.has(r.playerId)) continue;
      seenIso.add(r.playerId);
      stmts.push(
        db
          .prepare(
            `INSERT INTO isolation_rules (game_id, player_id, counterpart_id, created_at)
             VALUES (?, ?, ?, ?)`
          )
          .bind(id, r.playerId, r.counterpartId, now)
      );
    }

    // aliases (canonicalized)
    for (const a of canonAliases) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO player_aliases (game_id, player_id, alias_to_player_id, created_at, created_by)
             VALUES (?, ?, ?, ?, ?)`
          )
          .bind(id, a.playerId, a.aliasToPlayerId, now, input.actorLabel)
      );
    }

    // payments — the FINAL settlement plan
    let position = 0;
    for (const txn of plan.txns) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO payments
              (id, game_id, from_player_id, to_player_id, amount_cents, forced, position, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            newId('p_'),
            id,
            txn.fromId,
            txn.toId,
            txn.amountCents,
            txn.forced ? 1 : 0,
            position++,
            now
          )
      );
    }

    // audit
    stmts.push(
      auditStmt(db, {
        gameId: id,
        action: 'create_game',
        actorLabel: input.actorLabel,
        payload: {
          sourceKind: input.sourceKind,
          sourceRef: input.sourceRef,
          sourceUnit: input.sourceUnit,
          unitProvenance: input.unitProvenance,
          playerCount: rows.length,
          adjustmentCount: input.adjustments.length,
          isolationCount: seenIso.size,
          aliasCount: canonAliases.length,
          paymentPreferenceCount: paymentPreferences.length,
          paymentCount: plan.txns.length,
          finalizedAtCreate: true,
        },
        createdAt: now,
      })
    );
    stmts.push(
      auditStmt(db, {
        gameId: id,
        action: 'finalize',
        actorLabel: input.actorLabel,
        payload: { atCreate: true },
        createdAt: now,
      })
    );

    try {
      await db.batch(stmts);
    } catch (err) {
      const message = (err as Error).message ?? '';
      if (/UNIQUE.*games\.id/i.test(message) || /UNIQUE.*PRIMARY/i.test(message)) {
        continue;
      }
      throw err;
    }

    const snapshot = await loadGame(db, id);
    if (!snapshot) {
      throw new Error('Game inserted but vanished — broken D1?');
    }
    return snapshot;
  }
  throw new Error('Could not allocate a unique slug after 4 attempts');
}

/* ──────── Mutations ──────── */

/**
 * Toggle a payment's completion state. Records an audit entry. Bumps
 * `games.updated_at` for cache busting. Returns the full updated game
 * snapshot so the caller can hand it to the client authoritatively
 * (avoiding a race where polling fetches stale state between the PATCH
 * commit and a follow-up GET).
 *
 * Returns `null` only when no row matched the (gameId, paymentId) pair
 * — i.e. the payment doesn't exist for that game.
 */
export async function setPaymentCompleted(
  db: D1Database,
  args: {
    gameId: string;
    paymentId: string;
    completed: boolean;
    actorLabel: string | null;
  }
): Promise<DbGameSnapshot | null> {
  const now = Date.now();
  // First confirm the payment exists; if not, short-circuit with null so
  // the route handler can return 404 without firing UPDATE/INSERT writes.
  const existing = await db
    .prepare('SELECT id FROM payments WHERE id = ? AND game_id = ?')
    .bind(args.paymentId, args.gameId)
    .first<Record<string, unknown>>();
  if (!existing) return null;

  const update = args.completed
    ? db
        .prepare(
          `UPDATE payments SET completed_at = ?, completed_by = ? WHERE id = ? AND game_id = ?`
        )
        .bind(now, args.actorLabel, args.paymentId, args.gameId)
    : db
        .prepare(
          `UPDATE payments SET completed_at = NULL, completed_by = NULL WHERE id = ? AND game_id = ?`
        )
        .bind(args.paymentId, args.gameId);

  await db.batch([
    update,
    db
      .prepare('UPDATE games SET updated_at = ? WHERE id = ?')
      .bind(now, args.gameId),
    auditStmt(db, {
      gameId: args.gameId,
      action: args.completed ? 'complete_payment' : 'reopen_payment',
      actorLabel: args.actorLabel,
      payload: { paymentId: args.paymentId },
      createdAt: now,
    }),
  ]);

  const refreshed = await loadGame(db, args.gameId);
  if (!refreshed) {
    throw new Error(`Game ${args.gameId} vanished during payment toggle`);
  }
  return refreshed;
}

/**
 * Add an adjustment (already-paid transfer). Re-derives the settlement
 * plan and migrates completion state from any matching old payments.
 */
export async function addAdjustment(
  db: D1Database,
  args: {
    gameId: string;
    fromPlayerId: string;
    toPlayerId: string;
    amountCents: number;
    actorLabel: string | null;
  }
): Promise<DbGameSnapshot> {
  await ensureUnlocked(db, args.gameId);
  const now = Date.now();
  const adjId = newId('a_');
  await db.batch([
    db
      .prepare(
        `INSERT INTO adjustments (id, game_id, from_player_id, to_player_id, amount_cents, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        adjId,
        args.gameId,
        args.fromPlayerId,
        args.toPlayerId,
        args.amountCents,
        now,
        args.actorLabel
      ),
    auditStmt(db, {
      gameId: args.gameId,
      action: 'add_adjustment',
      actorLabel: args.actorLabel,
      payload: {
        adjustmentId: adjId,
        fromPlayerId: args.fromPlayerId,
        toPlayerId: args.toPlayerId,
        amountCents: args.amountCents,
      },
      createdAt: now,
    }),
  ]);
  return rederivePlan(db, args.gameId);
}

export async function removeAdjustment(
  db: D1Database,
  args: { gameId: string; adjustmentId: string; actorLabel: string | null }
): Promise<DbGameSnapshot> {
  await ensureUnlocked(db, args.gameId);
  const now = Date.now();
  await db.batch([
    db
      .prepare('DELETE FROM adjustments WHERE id = ? AND game_id = ?')
      .bind(args.adjustmentId, args.gameId),
    auditStmt(db, {
      gameId: args.gameId,
      action: 'remove_adjustment',
      actorLabel: args.actorLabel,
      payload: { adjustmentId: args.adjustmentId },
      createdAt: now,
    }),
  ]);
  return rederivePlan(db, args.gameId);
}

export async function setIsolation(
  db: D1Database,
  args: {
    gameId: string;
    playerId: string;
    counterpartId: string;
    actorLabel: string | null;
  }
): Promise<DbGameSnapshot> {
  await ensureUnlocked(db, args.gameId);
  const now = Date.now();
  await db.batch([
    db
      .prepare(
        `INSERT INTO isolation_rules (game_id, player_id, counterpart_id, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(game_id, player_id) DO UPDATE SET counterpart_id = excluded.counterpart_id, created_at = excluded.created_at`
      )
      .bind(args.gameId, args.playerId, args.counterpartId, now),
    auditStmt(db, {
      gameId: args.gameId,
      action: 'set_isolation',
      actorLabel: args.actorLabel,
      payload: {
        playerId: args.playerId,
        counterpartId: args.counterpartId,
      },
      createdAt: now,
    }),
  ]);
  return rederivePlan(db, args.gameId);
}

export async function clearIsolation(
  db: D1Database,
  args: { gameId: string; playerId: string; actorLabel: string | null }
): Promise<DbGameSnapshot> {
  await ensureUnlocked(db, args.gameId);
  const now = Date.now();
  await db.batch([
    db
      .prepare('DELETE FROM isolation_rules WHERE game_id = ? AND player_id = ?')
      .bind(args.gameId, args.playerId),
    auditStmt(db, {
      gameId: args.gameId,
      action: 'clear_isolation',
      actorLabel: args.actorLabel,
      payload: { playerId: args.playerId },
      createdAt: now,
    }),
  ]);
  return rederivePlan(db, args.gameId);
}

/* ──────── Alias mutations ──────── */

export class AliasValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AliasValidationError';
  }
}

/**
 * Add (or update) an alias rule. Validates:
 *   - playerId !== aliasToPlayerId (no self-alias)
 *   - both ids exist in `players` for this game
 *   - adding `playerId → aliasToPlayerId` does not introduce a cycle
 *
 * Canonicalization on write: if `aliasToPlayerId` is itself aliased
 * (e.g. Y → Z is already stored), we store `playerId → Z` directly.
 * That keeps the alias graph a one-hop forest, simplifying every read.
 *
 * Idempotent: if `playerId` already aliases to the same canonical, we
 * still record an audit entry but return the snapshot unchanged.
 */
export async function addAlias(
  db: D1Database,
  args: {
    gameId: string;
    playerId: string;
    aliasToPlayerId: string;
    actorLabel: string | null;
  }
): Promise<DbGameSnapshot> {
  await ensureUnlocked(db, args.gameId);
  if (args.playerId === args.aliasToPlayerId) {
    throw new AliasValidationError(
      'A player cannot be aliased to themselves.'
    );
  }

  const snap = await loadGame(db, args.gameId);
  if (!snap) {
    throw new AliasValidationError(`No game with id "${args.gameId}".`);
  }

  const playerIds = new Set(snap.players.map((p) => p.playerId));
  if (!playerIds.has(args.playerId)) {
    throw new AliasValidationError(
      `Player "${args.playerId}" is not in this game.`
    );
  }
  if (!playerIds.has(args.aliasToPlayerId)) {
    throw new AliasValidationError(
      `Target player "${args.aliasToPlayerId}" is not in this game.`
    );
  }

  // Build the alias map AS IT WOULD LOOK after the proposed insert,
  // then check for a cycle starting from playerId. If canonicalize()
  // returns null, the new edge introduced a cycle.
  const proposed = new Map<string, string>();
  for (const a of snap.aliases) {
    if (a.playerId !== args.playerId) {
      proposed.set(a.playerId, a.aliasToPlayerId);
    }
  }
  proposed.set(args.playerId, args.aliasToPlayerId);

  const canonicalTarget = canonicalize(args.aliasToPlayerId, proposed);
  if (canonicalTarget === null) {
    throw new AliasValidationError(
      `Refusing alias: would form a cycle with existing rules.`
    );
  }
  if (canonicalTarget === args.playerId) {
    throw new AliasValidationError(
      `Refusing alias: target collapses back to ${args.playerId}.`
    );
  }

  const now = Date.now();
  await db.batch([
    db
      .prepare(
        `INSERT INTO player_aliases (game_id, player_id, alias_to_player_id, created_at, created_by)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(game_id, player_id) DO UPDATE SET
           alias_to_player_id = excluded.alias_to_player_id,
           created_at = excluded.created_at,
           created_by = excluded.created_by`
      )
      .bind(
        args.gameId,
        args.playerId,
        canonicalTarget,
        now,
        args.actorLabel
      ),
    auditStmt(db, {
      gameId: args.gameId,
      action: 'add_alias',
      actorLabel: args.actorLabel,
      payload: {
        playerId: args.playerId,
        aliasToPlayerId: canonicalTarget,
        // Keep the originally-requested target for audit transparency
        // when canonicalization redirected it.
        requestedTarget: args.aliasToPlayerId,
      },
      createdAt: now,
    }),
  ]);

  return rederivePlan(db, args.gameId);
}

export async function removeAlias(
  db: D1Database,
  args: { gameId: string; playerId: string; actorLabel: string | null }
): Promise<DbGameSnapshot> {
  await ensureUnlocked(db, args.gameId);
  const now = Date.now();
  await db.batch([
    db
      .prepare(
        'DELETE FROM player_aliases WHERE game_id = ? AND player_id = ?'
      )
      .bind(args.gameId, args.playerId),
    auditStmt(db, {
      gameId: args.gameId,
      action: 'remove_alias',
      actorLabel: args.actorLabel,
      payload: { playerId: args.playerId },
      createdAt: now,
    }),
  ]);
  return rederivePlan(db, args.gameId);
}

/* ──────── Finalize / unfinalize ──────── */

export class LockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LockedError';
  }
}

/**
 * Throws `LockedError` if the game is finalized. Used at the top of
 * structural mutations (adjustments / isolations / aliases) — note we
 * deliberately do NOT call this from `setPaymentCompleted` (marking
 * payments survives finalization by design) or `setPaymentMethods`
 * (a per-user UX setting, not a game-state mutation).
 */
export async function ensureUnlocked(
  db: D1Database,
  gameId: string
): Promise<DbGame> {
  const game = await loadGameRow(db, gameId);
  if (!game) {
    throw new LockedError(`No game with id "${gameId}".`);
  }
  if (game.finalizedAt !== null) {
    throw new LockedError(
      `Game is finalized (locked). Unfinalize first to make structural edits.`
    );
  }
  return game;
}

/**
 * Mark the game as finalized. Idempotent — re-finalizing an already
 * finalized game is a no-op (returns the current snapshot, no audit
 * entry). Returns the full snapshot for client authoritative-replace.
 */
export async function finalizeGame(
  db: D1Database,
  args: { gameId: string; actorLabel: string | null }
): Promise<DbGameSnapshot> {
  const game = await loadGameRow(db, args.gameId);
  if (!game) {
    throw new LockedError(`No game with id "${args.gameId}".`);
  }
  if (game.finalizedAt !== null) {
    const snap = await loadGame(db, args.gameId);
    if (!snap) throw new Error('Game vanished mid-finalize');
    return snap;
  }
  const now = Date.now();
  await db.batch([
    db
      .prepare(
        'UPDATE games SET finalized_at = ?, finalized_by = ?, updated_at = ? WHERE id = ?'
      )
      .bind(now, args.actorLabel, now, args.gameId),
    auditStmt(db, {
      gameId: args.gameId,
      action: 'finalize',
      actorLabel: args.actorLabel,
      payload: {},
      createdAt: now,
    }),
  ]);
  const snap = await loadGame(db, args.gameId);
  if (!snap) throw new Error('Game vanished mid-finalize');
  return snap;
}

/**
 * Reverse the finalize lock. Idempotent — unfinalizing a not-finalized
 * game is a no-op. Audit entry recorded so a friend can later see who
 * unlocked.
 */
export async function unfinalizeGame(
  db: D1Database,
  args: { gameId: string; actorLabel: string | null }
): Promise<DbGameSnapshot> {
  const game = await loadGameRow(db, args.gameId);
  if (!game) {
    throw new LockedError(`No game with id "${args.gameId}".`);
  }
  if (game.finalizedAt === null) {
    const snap = await loadGame(db, args.gameId);
    if (!snap) throw new Error('Game vanished mid-unfinalize');
    return snap;
  }
  const now = Date.now();
  await db.batch([
    db
      .prepare(
        'UPDATE games SET finalized_at = NULL, finalized_by = NULL, updated_at = ? WHERE id = ?'
      )
      .bind(now, args.gameId),
    auditStmt(db, {
      gameId: args.gameId,
      action: 'unfinalize',
      actorLabel: args.actorLabel,
      payload: {
        previouslyFinalizedAt: game.finalizedAt,
        previouslyFinalizedBy: game.finalizedBy,
      },
      createdAt: now,
    }),
  ]);
  const snap = await loadGame(db, args.gameId);
  if (!snap) throw new Error('Game vanished mid-unfinalize');
  return snap;
}

/* ──────── Player payment methods ──────── */

export class PaymentMethodValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentMethodValidationError';
  }
}

/**
 * Upsert per-player Venmo / Zelle handles. Either side can be omitted
 * to leave it cleared. Allowed even after the game is finalized — these
 * are per-user UX settings, not game state.
 */
export async function setPaymentMethods(
  db: D1Database,
  args: {
    gameId: string;
    playerId: string;
    venmoUsername: string | null;
    zelleHandle: string | null;
    actorLabel: string | null;
  }
): Promise<DbGameSnapshot> {
  const game = await loadGameRow(db, args.gameId);
  if (!game) {
    throw new PaymentMethodValidationError(
      `No game with id "${args.gameId}".`
    );
  }

  // Player must exist in this game's roster.
  const playerRow = await db
    .prepare('SELECT 1 FROM players WHERE game_id = ? AND player_id = ?')
    .bind(args.gameId, args.playerId)
    .first();
  if (!playerRow) {
    throw new PaymentMethodValidationError(
      `Player "${args.playerId}" is not in this game.`
    );
  }

  const venmoUsername = args.venmoUsername?.trim().replace(/^@/, '') ?? null;
  const zelleHandle = args.zelleHandle?.trim() ?? null;
  const venmoFinal =
    venmoUsername && venmoUsername.length > 0 ? venmoUsername : null;
  const zelleFinal =
    zelleHandle && zelleHandle.length > 0 ? zelleHandle : null;

  const now = Date.now();
  await db.batch([
    db
      .prepare(
        `INSERT INTO player_payment_methods
          (game_id, player_id, venmo_username, zelle_handle, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(game_id, player_id) DO UPDATE SET
           venmo_username = excluded.venmo_username,
           zelle_handle   = excluded.zelle_handle,
           updated_at     = excluded.updated_at,
           updated_by     = excluded.updated_by`
      )
      .bind(
        args.gameId,
        args.playerId,
        venmoFinal,
        zelleFinal,
        now,
        args.actorLabel
      ),
    db
      .prepare('UPDATE games SET updated_at = ? WHERE id = ?')
      .bind(now, args.gameId),
    auditStmt(db, {
      gameId: args.gameId,
      action: 'set_payment_methods',
      actorLabel: args.actorLabel,
      payload: {
        playerId: args.playerId,
        hasVenmo: venmoFinal !== null,
        hasZelle: zelleFinal !== null,
      },
      createdAt: now,
    }),
  ]);
  const snap = await loadGame(db, args.gameId);
  if (!snap) throw new Error('Game vanished mid-payment-method-update');
  return snap;
}

/* ──────── Game note ──────── */

/**
 * Update the per-game note (Venmo deep-link `note=` param). Survives
 * finalize by design — purely a UX setting, not game state. Pass an
 * empty string or null to clear.
 *
 * Returns the full snapshot so the client can replace local state
 * authoritatively without a follow-up GET.
 */
export async function setGameNote(
  db: D1Database,
  args: { gameId: string; note: string | null; actorLabel: string | null }
): Promise<DbGameSnapshot> {
  const game = await loadGameRow(db, args.gameId);
  if (!game) {
    throw new Error(`No game with id "${args.gameId}".`);
  }
  const next = normalizeNote(args.note);
  const now = Date.now();
  await db.batch([
    db
      .prepare('UPDATE games SET note = ?, updated_at = ? WHERE id = ?')
      .bind(next, now, args.gameId),
    auditStmt(db, {
      gameId: args.gameId,
      action: 'set_note',
      actorLabel: args.actorLabel,
      payload: {
        previous: game.note,
        next,
      },
      createdAt: now,
    }),
  ]);
  const snap = await loadGame(db, args.gameId);
  if (!snap) throw new Error('Game vanished mid-note-update');
  return snap;
}

/* ──────── Plan re-derivation ──────── */

/**
 * Recompute the settlement plan after a structural mutation (adjustment or
 * isolation rule change). The strategy:
 *   1. Pull current players + adjustments + isolation rules.
 *   2. Run `buildSettlementPlan` to get the canonical txn list.
 *   3. Diff against existing payments by (from, to, amount): unchanged
 *      txns inherit their completion state; new ones start as pending;
 *      payments that no longer exist in the plan are deleted.
 *   4. Atomically replace the payments table for this game.
 */
async function rederivePlan(db: D1Database, gameId: string): Promise<DbGameSnapshot> {
  const snap = await loadGame(db, gameId);
  if (!snap) {
    throw new Error(`Game ${gameId} disappeared mid-mutation`);
  }

  // 1. Build the alias canonical map. Every read below routes player ids
  //    through this map so the resulting plan operates on the COLLAPSED
  //    roster. Removing an alias just produces an empty map and the rest
  //    of the pipeline runs as before.
  const canonical = buildCanonicalMap(snap.aliases);

  const rawRows: LedgerRow[] = snap.players.map((p) => ({
    playerId: p.playerId,
    nickname: p.nickname,
    netCents: p.netCents,
    buyInCents: 0,
    buyOutCents: 0,
  }));

  const rawAdjustments: Adjustment[] = snap.adjustments.map((a) => ({
    id: a.id,
    fromId: a.fromPlayerId,
    toId: a.toPlayerId,
    amountCents: a.amountCents,
  }));

  const rawIsolations: IsolationRule[] = snap.isolations.map((i) => ({
    playerId: i.playerId,
    counterpartId: i.counterpartId,
  }));

  // 2. Collapse rows + adjustments + isolations through the canonical map.
  const ledgerRows = collapseRows(rawRows, canonical);
  const adjustments = collapseAdjustments(rawAdjustments, canonical);
  const { rules: isolations } = collapseIsolations(rawIsolations, canonical);

  // 3. Adjustments → effective balances → settlement plan.
  const balances = applyAdjustments(ledgerRows, adjustments);
  const plan = buildSettlementPlan(balances, isolations);

  // 4. Persist the new payment list. We canonicalize OLD payment keys
  //    before matching so completion state survives alias additions
  //    (the previous payment's from/to would otherwise be the
  //    pre-collapse player ids and miss the new canonical-id txns).
  await replacePayments(db, gameId, plan, snap.payments, canonical);
  const refreshed = await loadGame(db, gameId);
  if (!refreshed) throw new Error('Game vanished after re-derivation');
  return refreshed;
}

function txnKey(t: Pick<SettlementTxn, 'fromId' | 'toId' | 'amountCents'>): string {
  return `${t.fromId}|${t.toId}|${t.amountCents}`;
}

async function replacePayments(
  db: D1Database,
  gameId: string,
  plan: SettlementPlan,
  oldPayments: DbPayment[],
  canonical: ReadonlyMap<string, string>
): Promise<void> {
  // Build a lookup from key → first matching old payment so we can preserve
  // completion state. We canonicalize the old payment ids through the
  // current alias map first, otherwise an alias addition would invalidate
  // every key (the new plan uses canonical ids; the old payments still
  // hold pre-collapse ids).
  const canonicalOf = (id: string) => canonical.get(id) ?? id;
  const oldByKey = new Map<string, DbPayment[]>();
  for (const p of oldPayments) {
    const key = txnKey({
      fromId: canonicalOf(p.fromPlayerId),
      toId: canonicalOf(p.toPlayerId),
      amountCents: p.amountCents,
    });
    const bucket = oldByKey.get(key) ?? [];
    bucket.push(p);
    oldByKey.set(key, bucket);
  }

  const now = Date.now();
  const stmts: D1PreparedStatement[] = [
    db.prepare('DELETE FROM payments WHERE game_id = ?').bind(gameId),
  ];

  let position = 0;
  for (const txn of plan.txns) {
    const key = txnKey(txn);
    const bucket = oldByKey.get(key);
    const carryOver = bucket && bucket.length > 0 ? bucket.shift()! : null;
    const id = carryOver?.id ?? newId('p_');
    const completedAt = carryOver?.completedAt ?? null;
    const completedBy = carryOver?.completedBy ?? null;
    const createdAt = carryOver ? now : now; // We're overwriting; keep it simple.

    stmts.push(
      db
        .prepare(
          `INSERT INTO payments
            (id, game_id, from_player_id, to_player_id, amount_cents, forced, position, completed_at, completed_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          gameId,
          txn.fromId,
          txn.toId,
          txn.amountCents,
          txn.forced ? 1 : 0,
          position++,
          completedAt,
          completedBy,
          createdAt
        )
    );
  }

  stmts.push(
    db
      .prepare('UPDATE games SET updated_at = ? WHERE id = ?')
      .bind(now, gameId)
  );

  await db.batch(stmts);
}

/* ──────── Audit log ──────── */

function auditStmt(
  db: D1Database,
  args: {
    gameId: string;
    action: AuditAction;
    actorLabel: string | null;
    payload: unknown;
    createdAt: number;
  }
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO audit_log (id, game_id, action, actor_label, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      newId('al_'),
      args.gameId,
      args.action,
      args.actorLabel,
      JSON.stringify(args.payload ?? {}),
      args.createdAt
    );
}
