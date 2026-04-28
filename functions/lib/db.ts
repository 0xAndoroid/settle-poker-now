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
import type {
  Adjustment,
  IsolationRule,
  LedgerRow,
  LedgerUnit,
  SettlementPlan,
  SettlementTxn,
} from '../../src/lib/types';

/* ──────── Types ──────── */

export type UnitProvenance = 'header' | 'heuristic' | 'user';

export interface DbGame {
  id: string;
  pokernowGameId: string;
  sourceUnit: LedgerUnit;
  unitProvenance: UnitProvenance;
  startedAt: number | null;
  endedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface DbPlayer {
  playerId: string;
  nickname: string;
  netCents: number;
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
  | 'clear_isolation';

export interface DbGameSnapshot {
  game: DbGame;
  players: DbPlayer[];
  payments: DbPayment[];
  adjustments: DbAdjustment[];
  isolations: DbIsolation[];
  audit: DbAuditEntry[];
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
    sourceUnit: row.source_unit as LedgerUnit,
    unitProvenance: row.unit_provenance as UnitProvenance,
    startedAt: (row.started_at as number | null) ?? null,
    endedAt: (row.ended_at as number | null) ?? null,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function rowToPlayer(row: Record<string, unknown>): DbPlayer {
  return {
    playerId: row.player_id as string,
    nickname: row.nickname as string,
    netCents: row.net_cents as number,
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
  const [playersRes, paymentsRes, adjustmentsRes, isolationsRes, auditRes] =
    await Promise.all([
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
          `INSERT INTO games (id, pokernow_game_id, source_unit, unit_provenance, started_at, ended_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          input.pokernowGameId,
          input.sourceUnit,
          input.unitProvenance,
          input.startedAt,
          input.endedAt,
          now,
          now
        )
    );

    for (const row of input.rows) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO players (game_id, player_id, nickname, net_cents) VALUES (?, ?, ?, ?)`
          )
          .bind(id, row.playerId, row.nickname, row.netCents)
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

/* ──────── Mutations ──────── */

/**
 * Toggle a payment's completion state. Records an audit entry. Bumps
 * `games.updated_at` for cache busting.
 */
export async function setPaymentCompleted(
  db: D1Database,
  args: {
    gameId: string;
    paymentId: string;
    completed: boolean;
    actorLabel: string | null;
  }
): Promise<DbPayment | null> {
  const now = Date.now();
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

  const row = await db
    .prepare('SELECT * FROM payments WHERE id = ? AND game_id = ?')
    .bind(args.paymentId, args.gameId)
    .first<Record<string, unknown>>();
  return row ? rowToPayment(row) : null;
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

  const ledgerRows: LedgerRow[] = snap.players.map((p) => ({
    playerId: p.playerId,
    nickname: p.nickname,
    netCents: p.netCents,
    buyInCents: 0,
    buyOutCents: 0,
  }));

  const adjustments: Adjustment[] = snap.adjustments.map((a) => ({
    id: a.id,
    fromId: a.fromPlayerId,
    toId: a.toPlayerId,
    amountCents: a.amountCents,
  }));

  const isolations: IsolationRule[] = snap.isolations.map((i) => ({
    playerId: i.playerId,
    counterpartId: i.counterpartId,
  }));

  const balances = applyAdjustments(ledgerRows, adjustments);
  const plan = buildSettlementPlan(balances, isolations);

  await replacePayments(db, gameId, plan, snap.payments);
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
  oldPayments: DbPayment[]
): Promise<void> {
  // Build a lookup from key → first matching old payment so we can preserve
  // completion state. If multiple old payments collide on the same key
  // (rare but possible if the same txn appears twice), consume them in
  // insertion order.
  const oldByKey = new Map<string, DbPayment[]>();
  for (const p of oldPayments) {
    const key = txnKey({
      fromId: p.fromPlayerId,
      toId: p.toPlayerId,
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
