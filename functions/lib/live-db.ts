import {
  deriveFinalLedgerRows,
  deriveLiveBankSummary,
  deriveLivePlayerSummaries,
  derivePriorPaymentAdjustments,
  validateLiveFinalization,
} from '../../src/lib/liveProjection';
import type {
  LiveAuditAction,
  LiveAuditEntry,
  LiveChipCheckpoint,
  LiveChipCheckpointType,
  LiveEntry,
  LiveEntryType,
  LiveGame,
  LiveGameSnapshot,
  LivePaymentMethod,
  LivePlayer,
  LivePlayerStatus,
} from '../../src/lib/types';
import {
  type DbGameSnapshot,
  CreateFinalizedValidationError,
  LockedError,
  insertFinalizedGameSnapshot,
  loadGame,
  newGameSlug,
  newId,
} from './db';

export class LiveValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LiveValidationError';
  }
}

export class LiveNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LiveNotFoundError';
  }
}

export class LiveConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LiveConflictError';
  }
}

interface CreateLiveGameInput {
  hostName?: string | null;
  totalChipBankCents?: number | null;
  title?: string | null;
  note?: string | null;
  actorLabel?: string | null;
  clientEventId?: string | null;
}

interface LiveMutationBase {
  gameId: string;
  clientEventId: string;
  actorLabel: string | null;
}

const PLAYER_NAME_MAX = 80;
const NOTE_MAX = 160;
const PAYMENT_METHODS = new Set<LivePaymentMethod>([
  'cash',
  'venmo',
  'zelle',
  'other',
]);

function cleanText(raw: string | null | undefined, max = NOTE_MAX): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed.slice(0, max) : null;
}

function cleanName(raw: string): string {
  const trimmed = raw.trim().slice(0, PLAYER_NAME_MAX);
  if (!trimmed) throw new LiveValidationError('Player name is required.');
  return trimmed;
}

function assertCents(value: number, label: string, allowZero = false): number {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new LiveValidationError(`${label} must be an integer cent amount.`);
  }
  if (allowZero ? value < 0 : value <= 0) {
    throw new LiveValidationError(
      allowZero ? `${label} cannot be negative.` : `${label} must be positive.`
    );
  }
  return value;
}

function rowToLiveGame(row: Record<string, unknown>): LiveGame {
  return {
    id: row.id as string,
    status: row.status as LiveGame['status'],
    hostPlayerId: (row.host_player_id as string | null) ?? null,
    title: (row.title as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    totalChipBankCents:
      (row.total_chip_bank_cents as number | null | undefined) ?? null,
    version: row.version as number,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
    finalizedAt: (row.finalized_at as number | null) ?? null,
    finalizedGameId: (row.finalized_game_id as string | null) ?? null,
  };
}

function rowToLivePlayer(row: Record<string, unknown>): LivePlayer {
  return {
    gameId: row.game_id as string,
    playerId: row.player_id as string,
    name: row.name as string,
    isHost: (row.is_host as number) === 1,
    status: row.status as LivePlayerStatus,
    sortOrder: row.sort_order as number,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function rowToLiveEntry(row: Record<string, unknown>): LiveEntry {
  return {
    id: row.id as string,
    gameId: row.game_id as string,
    playerId: row.player_id as string,
    entryType: row.entry_type as LiveEntryType,
    amountCents: row.amount_cents as number,
    toPlayerId: (row.to_player_id as string | null) ?? null,
    paymentMethod: (row.payment_method as LivePaymentMethod | null) ?? null,
    isFinal: (row.is_final as number) === 1,
    note: (row.note as string | null) ?? null,
    clientEventId: row.client_event_id as string,
    createdAt: row.created_at as number,
    createdBy: (row.created_by as string | null) ?? null,
    voidedAt: (row.voided_at as number | null) ?? null,
    voidedBy: (row.voided_by as string | null) ?? null,
    voidReason: (row.void_reason as string | null) ?? null,
  };
}

function rowToLiveCheckpoint(row: Record<string, unknown>): LiveChipCheckpoint {
  return {
    id: row.id as string,
    gameId: row.game_id as string,
    checkpointType: row.checkpoint_type as LiveChipCheckpointType,
    amountCents: row.amount_cents as number,
    expectedCents: (row.expected_cents as number | null) ?? null,
    deltaCents: (row.delta_cents as number | null) ?? null,
    note: (row.note as string | null) ?? null,
    clientEventId: row.client_event_id as string,
    createdAt: row.created_at as number,
    createdBy: (row.created_by as string | null) ?? null,
  };
}

function rowToLiveAudit(row: Record<string, unknown>): LiveAuditEntry {
  let payload: unknown = {};
  try {
    payload = JSON.parse((row.payload as string | null) ?? '{}');
  } catch {
    payload = {};
  }
  return {
    id: row.id as string,
    action: row.action as LiveAuditAction,
    actorLabel: (row.actor_label as string | null) ?? null,
    payload,
    clientEventId: (row.client_event_id as string | null) ?? null,
    createdAt: row.created_at as number,
  };
}

function projectSnapshot(parts: {
  game: LiveGame;
  players: LivePlayer[];
  entries: LiveEntry[];
  chipCheckpoints: LiveChipCheckpoint[];
  audit: LiveAuditEntry[];
}): LiveGameSnapshot {
  const partial = {
    ...parts,
    playerSummaries: [],
    bankSummary: {
      totalChipBankCents: null,
      chipsInPlayCents: 0,
      expectedBankOnHandCents: null,
      latestTableCountCents: null,
      latestTableExpectedCents: null,
      latestTableDeltaCents: null,
      latestBankCountCents: null,
      latestBankExpectedCents: null,
      latestBankDeltaCents: null,
    },
  } as LiveGameSnapshot;
  return {
    ...parts,
    playerSummaries: deriveLivePlayerSummaries(partial),
    bankSummary: deriveLiveBankSummary(partial),
  };
}

export async function loadLiveGame(
  db: D1Database,
  id: string
): Promise<LiveGameSnapshot | null> {
  const gameRow = await db
    .prepare('SELECT * FROM live_games WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!gameRow) return null;

  const [playersRes, entriesRes, checkpointsRes, auditRes] = await Promise.all([
    db
      .prepare('SELECT * FROM live_players WHERE game_id = ? ORDER BY sort_order ASC')
      .bind(id)
      .all<Record<string, unknown>>(),
    db
      .prepare('SELECT * FROM live_entries WHERE game_id = ? ORDER BY created_at ASC')
      .bind(id)
      .all<Record<string, unknown>>(),
    db
      .prepare(
        'SELECT * FROM live_chip_checkpoints WHERE game_id = ? ORDER BY created_at ASC'
      )
      .bind(id)
      .all<Record<string, unknown>>(),
    db
      .prepare(
        'SELECT * FROM live_audit_log WHERE game_id = ? ORDER BY created_at DESC LIMIT 100'
      )
      .bind(id)
      .all<Record<string, unknown>>(),
  ]);

  return projectSnapshot({
    game: rowToLiveGame(gameRow),
    players: (playersRes.results ?? []).map(rowToLivePlayer),
    entries: (entriesRes.results ?? []).map(rowToLiveEntry),
    chipCheckpoints: (checkpointsRes.results ?? []).map(rowToLiveCheckpoint),
    audit: (auditRes.results ?? []).map(rowToLiveAudit),
  });
}

export async function createLiveGame(
  db: D1Database,
  input: CreateLiveGameInput
): Promise<LiveGameSnapshot> {
  const now = Date.now();
  const hostName = cleanText(input.hostName ?? null, PLAYER_NAME_MAX);
  const totalChipBankCents =
    input.totalChipBankCents === null || input.totalChipBankCents === undefined
      ? null
      : assertCents(input.totalChipBankCents, 'totalChipBankCents', true);

  for (let attempt = 0; attempt < 4; attempt++) {
    const id = newGameSlug();
    const hostPlayerId = hostName ? newId('lp_') : null;
    const stmts: D1PreparedStatement[] = [
      db
        .prepare(
          `INSERT INTO live_games
            (id, status, host_player_id, title, note, total_chip_bank_cents, version, created_at, updated_at)
           VALUES (?, 'active', ?, ?, ?, ?, 0, ?, ?)`
        )
        .bind(
          id,
          hostPlayerId,
          cleanText(input.title ?? null),
          cleanText(input.note ?? null),
          totalChipBankCents,
          now,
          now
        ),
      liveAuditStmt(db, {
        gameId: id,
        action: 'create_live_game',
        actorLabel: input.actorLabel ?? hostName,
        payload: {
          hasHost: hostPlayerId !== null,
          hasChipBank: totalChipBankCents !== null,
        },
        clientEventId: input.clientEventId ?? null,
        createdAt: now,
      }),
    ];

    if (hostName && hostPlayerId) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO live_players
              (game_id, player_id, name, is_host, status, sort_order, created_at, updated_at)
             VALUES (?, ?, ?, 1, 'active', 0, ?, ?)`
          )
          .bind(id, hostPlayerId, hostName, now, now)
      );
    }

    if (totalChipBankCents !== null) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO live_chip_checkpoints
              (id, game_id, checkpoint_type, amount_cents, expected_cents, delta_cents, note, client_event_id, created_at, created_by)
             VALUES (?, ?, 'set_bank_total', ?, ?, 0, ?, ?, ?, ?)`
          )
          .bind(
            newId('lcc_'),
            id,
            totalChipBankCents,
            totalChipBankCents,
            null,
            input.clientEventId ? `${input.clientEventId}:bank` : newId('ce_'),
            now,
            input.actorLabel ?? hostName
          )
      );
    }

    try {
      await db.batch(stmts);
    } catch (err) {
      const message = (err as Error).message ?? '';
      if (/UNIQUE.*live_games\.id/i.test(message) || /UNIQUE.*PRIMARY/i.test(message)) {
        continue;
      }
      throw err;
    }

    const snapshot = await loadLiveGame(db, id);
    if (!snapshot) throw new Error('Live game inserted but vanished.');
    return snapshot;
  }
  throw new Error('Could not allocate a unique live slug after 4 attempts');
}

async function ensureActiveLiveGame(
  db: D1Database,
  gameId: string
): Promise<LiveGame> {
  const row = await db
    .prepare('SELECT * FROM live_games WHERE id = ?')
    .bind(gameId)
    .first<Record<string, unknown>>();
  if (!row) throw new LiveNotFoundError(`No live game with id "${gameId}".`);
  const game = rowToLiveGame(row);
  if (game.status === 'finalized' || game.status === 'finalizing') {
    throw new LockedError(`Live game is ${game.status}.`);
  }
  if (game.status !== 'active') {
    throw new LockedError(`Live game is ${game.status}.`);
  }
  return game;
}

async function loadActiveSnapshot(
  db: D1Database,
  gameId: string
): Promise<LiveGameSnapshot> {
  await ensureActiveLiveGame(db, gameId);
  const snapshot = await loadLiveGame(db, gameId);
  if (!snapshot) throw new LiveNotFoundError(`No live game with id "${gameId}".`);
  return snapshot;
}

async function auditEventExists(
  db: D1Database,
  gameId: string,
  clientEventId: string
): Promise<boolean> {
  const row = await db
    .prepare(
      'SELECT 1 FROM live_audit_log WHERE game_id = ? AND client_event_id = ? LIMIT 1'
    )
    .bind(gameId, clientEventId)
    .first();
  return !!row;
}

async function entryEventExists(
  db: D1Database,
  gameId: string,
  clientEventId: string
): Promise<boolean> {
  const row = await db
    .prepare(
      'SELECT 1 FROM live_entries WHERE game_id = ? AND client_event_id = ? LIMIT 1'
    )
    .bind(gameId, clientEventId)
    .first();
  return !!row;
}

async function checkpointEventExists(
  db: D1Database,
  gameId: string,
  clientEventId: string
): Promise<boolean> {
  const row = await db
    .prepare(
      'SELECT 1 FROM live_chip_checkpoints WHERE game_id = ? AND client_event_id = ? LIMIT 1'
    )
    .bind(gameId, clientEventId)
    .first();
  return !!row;
}

async function loadRequiredSnapshot(
  db: D1Database,
  gameId: string
): Promise<LiveGameSnapshot> {
  const snapshot = await loadLiveGame(db, gameId);
  if (!snapshot) throw new LiveNotFoundError(`No live game with id "${gameId}".`);
  return snapshot;
}

export async function addLivePlayer(
  db: D1Database,
  args: LiveMutationBase & { name: string; isHost?: boolean }
): Promise<LiveGameSnapshot> {
  if (await auditEventExists(db, args.gameId, args.clientEventId)) {
    return loadRequiredSnapshot(db, args.gameId);
  }
  await ensureActiveLiveGame(db, args.gameId);
  const name = cleanName(args.name);
  const now = Date.now();
  const playerId = newId('lp_');
  const orderRow = await db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM live_players WHERE game_id = ?')
    .bind(args.gameId)
    .first<Record<string, unknown>>();
  const sortOrder = Number(orderRow?.max_order ?? -1) + 1;
  const stmts: D1PreparedStatement[] = [];

  if (args.isHost === true) {
    stmts.push(
      db.prepare('UPDATE live_players SET is_host = 0 WHERE game_id = ?').bind(args.gameId)
    );
  }
  stmts.push(
    db
      .prepare(
        `INSERT INTO live_players
          (game_id, player_id, name, is_host, status, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`
      )
      .bind(args.gameId, playerId, name, args.isHost === true ? 1 : 0, sortOrder, now, now)
  );
  stmts.push(
    db
      .prepare(
        `UPDATE live_games
         SET host_player_id = CASE WHEN ? = 1 THEN ? ELSE host_player_id END,
             version = version + 1,
             updated_at = ?
         WHERE id = ?`
      )
      .bind(args.isHost === true ? 1 : 0, playerId, now, args.gameId)
  );
  stmts.push(
    liveAuditStmt(db, {
      gameId: args.gameId,
      action: args.isHost === true ? 'set_host' : 'add_player',
      actorLabel: args.actorLabel,
      payload: { playerId, name, isHost: args.isHost === true },
      clientEventId: args.clientEventId,
      createdAt: now,
    })
  );

  await batchIdempotent(db, stmts, args.gameId);
  return loadRequiredSnapshot(db, args.gameId);
}

export async function renameLivePlayer(
  db: D1Database,
  args: LiveMutationBase & { playerId: string; name: string }
): Promise<LiveGameSnapshot> {
  return updateLivePlayer(db, {
    gameId: args.gameId,
    clientEventId: args.clientEventId,
    actorLabel: args.actorLabel,
    playerId: args.playerId,
    name: args.name,
  });
}

export async function setHostPlayer(
  db: D1Database,
  args: LiveMutationBase & { playerId: string }
): Promise<LiveGameSnapshot> {
  return updateLivePlayer(db, {
    gameId: args.gameId,
    clientEventId: args.clientEventId,
    actorLabel: args.actorLabel,
    playerId: args.playerId,
    isHost: true,
  });
}

export async function updateLivePlayer(
  db: D1Database,
  args: LiveMutationBase & {
    playerId: string;
    name?: string;
    status?: LivePlayerStatus;
    isHost?: boolean;
  }
): Promise<LiveGameSnapshot> {
  if (await auditEventExists(db, args.gameId, args.clientEventId)) {
    return loadRequiredSnapshot(db, args.gameId);
  }
  const snapshot = await loadActiveSnapshot(db, args.gameId);
  const player = snapshot.players.find((p) => p.playerId === args.playerId);
  if (!player) {
    throw new LiveValidationError(`Player "${args.playerId}" is not in this live game.`);
  }
  if (args.status && !['active', 'cashed_out', 'busted', 'removed'].includes(args.status)) {
    throw new LiveValidationError('Invalid player status.');
  }
  if (args.status === 'removed') {
    const hasEntries = snapshot.entries.some(
      (entry) => entry.playerId === args.playerId && entry.voidedAt === null
    );
    if (hasEntries) {
      throw new LiveValidationError('Void this player\'s entries before removing them.');
    }
  }

  const nextName = args.name === undefined ? player.name : cleanName(args.name);
  const nextStatus = args.status ?? player.status;
  const now = Date.now();
  const stmts: D1PreparedStatement[] = [];
  if (args.isHost === true) {
    stmts.push(
      db.prepare('UPDATE live_players SET is_host = 0 WHERE game_id = ?').bind(args.gameId)
    );
  } else if (args.isHost === false && player.isHost) {
    stmts.push(
      db
        .prepare('UPDATE live_games SET host_player_id = NULL WHERE id = ?')
        .bind(args.gameId)
    );
  }
  stmts.push(
    db
      .prepare(
        `UPDATE live_players
         SET name = ?, status = ?, is_host = CASE WHEN ? = 1 THEN 1 WHEN ? = 1 THEN 0 ELSE is_host END, updated_at = ?
         WHERE game_id = ? AND player_id = ?`
      )
      .bind(
        nextName,
        nextStatus,
        args.isHost === true ? 1 : 0,
        args.isHost === false ? 1 : 0,
        now,
        args.gameId,
        args.playerId
      )
  );
  stmts.push(
    db
      .prepare(
        `UPDATE live_games
         SET host_player_id = CASE WHEN ? = 1 THEN ? ELSE host_player_id END,
             version = version + 1,
             updated_at = ?
         WHERE id = ?`
      )
      .bind(args.isHost === true ? 1 : 0, args.playerId, now, args.gameId)
  );
  stmts.push(
    liveAuditStmt(db, {
      gameId: args.gameId,
      action: args.isHost === true ? 'set_host' : 'update_player',
      actorLabel: args.actorLabel,
      payload: {
        playerId: args.playerId,
        name: nextName,
        status: nextStatus,
        isHost: args.isHost,
      },
      clientEventId: args.clientEventId,
      createdAt: now,
    })
  );

  await batchIdempotent(db, stmts, args.gameId);
  return loadRequiredSnapshot(db, args.gameId);
}

export async function addLiveEntry(
  db: D1Database,
  args: LiveMutationBase & {
    playerId: string;
    entryType: LiveEntryType;
    amountCents: number;
    toPlayerId?: string | null;
    paymentMethod?: LivePaymentMethod | null;
    isFinal?: boolean;
    note?: string | null;
  }
): Promise<LiveGameSnapshot> {
  if (await entryEventExists(db, args.gameId, args.clientEventId)) {
    return loadRequiredSnapshot(db, args.gameId);
  }
  const snapshot = await loadActiveSnapshot(db, args.gameId);
  validateEntryInput(snapshot, args);

  const now = Date.now();
  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO live_entries
          (id, game_id, player_id, entry_type, amount_cents, to_player_id, payment_method, is_final, note, client_event_id, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        newId('le_'),
        args.gameId,
        args.playerId,
        args.entryType,
        args.amountCents,
        args.toPlayerId ?? null,
        args.paymentMethod ?? null,
        args.isFinal === true ? 1 : 0,
        cleanText(args.note ?? null),
        args.clientEventId,
        now,
        args.actorLabel
      ),
    statusUpdateForEntry(db, args.gameId, args.playerId, args.entryType, args.amountCents, args.isFinal === true, now),
    bumpLiveGameStmt(db, args.gameId, now),
  ];

  await batchIdempotent(db, stmts, args.gameId);
  return loadRequiredSnapshot(db, args.gameId);
}

export async function addBustedPaidHost(
  db: D1Database,
  args: LiveMutationBase & {
    playerId: string;
    amountCents: number;
    toPlayerId?: string | null;
    paymentMethod?: LivePaymentMethod | null;
    note?: string | null;
  }
): Promise<LiveGameSnapshot> {
  if (await auditEventExists(db, args.gameId, args.clientEventId)) {
    return loadRequiredSnapshot(db, args.gameId);
  }
  const snapshot = await loadActiveSnapshot(db, args.gameId);
  const payer = snapshot.players.find((p) => p.playerId === args.playerId);
  if (!payer || payer.status === 'removed') {
    throw new LiveValidationError('Busted player must be on the active roster.');
  }
  const toPlayerId = args.toPlayerId ?? snapshot.game.hostPlayerId;
  if (!toPlayerId) {
    throw new LiveValidationError('Set a host player before recording a host payment.');
  }
  if (toPlayerId === args.playerId) {
    throw new LiveValidationError('Busted player and host must differ.');
  }
  const host = snapshot.players.find((p) => p.playerId === toPlayerId);
  if (!host || host.status === 'removed') {
    throw new LiveValidationError('Host player is not in this live game.');
  }
  assertCents(args.amountCents, 'amountCents');
  if (args.paymentMethod && !PAYMENT_METHODS.has(args.paymentMethod)) {
    throw new LiveValidationError('Invalid payment method.');
  }
  ensureNoFinalCashout(snapshot, args.playerId);

  const now = Date.now();
  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO live_entries
          (id, game_id, player_id, entry_type, amount_cents, to_player_id, payment_method, is_final, note, client_event_id, created_at, created_by)
         VALUES (?, ?, ?, 'cash_out', 0, NULL, NULL, 1, ?, ?, ?, ?)`
      )
      .bind(
        newId('le_'),
        args.gameId,
        args.playerId,
        cleanText(args.note ?? null),
        `${args.clientEventId}:cashout`,
        now,
        args.actorLabel
      ),
    db
      .prepare(
        `INSERT INTO live_entries
          (id, game_id, player_id, entry_type, amount_cents, to_player_id, payment_method, is_final, note, client_event_id, created_at, created_by)
         VALUES (?, ?, ?, 'prior_payment', ?, ?, ?, 0, ?, ?, ?, ?)`
      )
      .bind(
        newId('le_'),
        args.gameId,
        args.playerId,
        args.amountCents,
        toPlayerId,
        args.paymentMethod ?? null,
        cleanText(args.note ?? null),
        `${args.clientEventId}:payment`,
        now,
        args.actorLabel
      ),
    db
      .prepare(
        `UPDATE live_players SET status = 'busted', updated_at = ? WHERE game_id = ? AND player_id = ?`
      )
      .bind(now, args.gameId, args.playerId),
    bumpLiveGameStmt(db, args.gameId, now),
    liveAuditStmt(db, {
      gameId: args.gameId,
      action: 'busted_paid_host',
      actorLabel: args.actorLabel,
      payload: {
        playerId: args.playerId,
        toPlayerId,
        amountCents: args.amountCents,
        paymentMethod: args.paymentMethod ?? null,
      },
      clientEventId: args.clientEventId,
      createdAt: now,
    }),
  ];

  await batchIdempotent(db, stmts, args.gameId);
  return loadRequiredSnapshot(db, args.gameId);
}

export async function voidLiveEntry(
  db: D1Database,
  args: LiveMutationBase & { entryId: string; voidReason?: string | null }
): Promise<LiveGameSnapshot> {
  if (await auditEventExists(db, args.gameId, args.clientEventId)) {
    return loadRequiredSnapshot(db, args.gameId);
  }
  await ensureActiveLiveGame(db, args.gameId);
  const existing = await db
    .prepare('SELECT * FROM live_entries WHERE game_id = ? AND id = ?')
    .bind(args.gameId, args.entryId)
    .first<Record<string, unknown>>();
  if (!existing) {
    throw new LiveValidationError(`No entry with id "${args.entryId}".`);
  }
  const entry = rowToLiveEntry(existing);
  if (entry.voidedAt !== null) return loadRequiredSnapshot(db, args.gameId);

  const now = Date.now();
  await db.batch([
    db
      .prepare(
        `UPDATE live_entries
         SET voided_at = ?, voided_by = ?, void_reason = ?
         WHERE game_id = ? AND id = ?`
      )
      .bind(
        now,
        args.actorLabel,
        cleanText(args.voidReason ?? null),
        args.gameId,
        args.entryId
      ),
    recalcPlayerStatusStmt(db, args.gameId, entry.playerId, now),
    bumpLiveGameStmt(db, args.gameId, now),
    liveAuditStmt(db, {
      gameId: args.gameId,
      action: 'void_entry',
      actorLabel: args.actorLabel,
      payload: { entryId: args.entryId, playerId: entry.playerId },
      clientEventId: args.clientEventId,
      createdAt: now,
    }),
  ]);
  return loadRequiredSnapshot(db, args.gameId);
}

export async function addChipCheckpoint(
  db: D1Database,
  args: LiveMutationBase & {
    checkpointType: LiveChipCheckpointType;
    amountCents: number;
    note?: string | null;
  }
): Promise<LiveGameSnapshot> {
  if (await checkpointEventExists(db, args.gameId, args.clientEventId)) {
    return loadRequiredSnapshot(db, args.gameId);
  }
  const snapshot = await loadActiveSnapshot(db, args.gameId);
  assertCents(args.amountCents, 'amountCents', true);
  if (
    !['set_bank_total', 'verify_table_count', 'verify_bank_count'].includes(
      args.checkpointType
    )
  ) {
    throw new LiveValidationError('Invalid checkpoint type.');
  }

  const bank = deriveLiveBankSummary(snapshot);
  const expected =
    args.checkpointType === 'set_bank_total'
      ? args.amountCents
      : args.checkpointType === 'verify_table_count'
        ? bank.chipsInPlayCents
        : bank.expectedBankOnHandCents;
  if (expected === null) {
    throw new LiveValidationError('Set a total chip bank before verifying bank count.');
  }
  const delta = args.amountCents - expected;
  const now = Date.now();
  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO live_chip_checkpoints
          (id, game_id, checkpoint_type, amount_cents, expected_cents, delta_cents, note, client_event_id, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        newId('lcc_'),
        args.gameId,
        args.checkpointType,
        args.amountCents,
        expected,
        delta,
        cleanText(args.note ?? null),
        args.clientEventId,
        now,
        args.actorLabel
      ),
    args.checkpointType === 'set_bank_total'
      ? db
          .prepare(
            `UPDATE live_games
             SET total_chip_bank_cents = ?, version = version + 1, updated_at = ?
             WHERE id = ?`
          )
          .bind(args.amountCents, now, args.gameId)
      : bumpLiveGameStmt(db, args.gameId, now),
  ];

  await batchIdempotent(db, stmts, args.gameId);
  return loadRequiredSnapshot(db, args.gameId);
}

export async function finalizeLiveGame(
  db: D1Database,
  args: {
    gameId: string;
    clientEventId: string;
    actorLabel: string | null;
    force?: boolean;
  }
): Promise<{ game: DbGameSnapshot; redirectPath: string }> {
  const existing = await loadLiveGame(db, args.gameId);
  if (!existing) throw new LiveNotFoundError(`No live game with id "${args.gameId}".`);
  if (existing.game.status === 'finalized' && existing.game.finalizedGameId) {
    const game = await loadGame(db, existing.game.finalizedGameId);
    if (!game) throw new LiveConflictError('Live game points at a missing finalized game.');
    return { game, redirectPath: `/g/${game.game.id}` };
  }
  if (existing.game.status === 'finalizing') {
    throw new LiveConflictError('Live game is already finalizing.');
  }
  if (existing.game.status !== 'active') {
    throw new LockedError(`Live game is ${existing.game.status}.`);
  }

  const validation = validateLiveFinalization(existing, {
    pendingCount: 0,
    force: args.force === true,
  });
  if (!validation.ok) {
    throw new CreateFinalizedValidationError(validation.errors.join(' '));
  }

  const now = Date.now();
  await db.batch([
    db
      .prepare(
        `UPDATE live_games
         SET status = 'finalizing', version = version + 1, updated_at = ?
         WHERE id = ? AND status = 'active'`
      )
      .bind(now, args.gameId),
    args.force === true
      ? liveAuditStmt(db, {
          gameId: args.gameId,
          action: 'force_finalize',
          actorLabel: args.actorLabel,
          payload: {
            tableDeltaCents: existing.bankSummary.latestTableDeltaCents,
            bankDeltaCents: existing.bankSummary.latestBankDeltaCents,
          },
          clientEventId: `${args.clientEventId}:force`,
          createdAt: now,
        })
      : noopStmt(db),
  ]);

  try {
    const rows = deriveFinalLedgerRows(existing);
    const adjustments = derivePriorPaymentAdjustments(existing).map((adj) => ({
      fromPlayerId: adj.fromId,
      toPlayerId: adj.toId,
      amountCents: adj.amountCents,
    }));
    const finalized = await insertFinalizedGameSnapshot(db, {
      id: args.gameId,
      sourceKind: 'live',
      sourceRef: args.gameId,
      sourceUnit: 'cents',
      unitProvenance: 'user',
      startedAt: existing.game.createdAt,
      endedAt: now,
      rows,
      adjustments,
      isolations: [],
      aliases: [],
      paymentPreferences: [],
      actorLabel: args.actorLabel,
      note: existing.game.note,
    });
    await db.batch([
      db
        .prepare(
          `UPDATE live_games
           SET status = 'finalized',
               finalized_at = ?,
               finalized_game_id = ?,
               version = version + 1,
               updated_at = ?
           WHERE id = ?`
        )
        .bind(now, finalized.game.id, now, args.gameId),
      liveAuditStmt(db, {
        gameId: args.gameId,
        action: 'finalize_live_game',
        actorLabel: args.actorLabel,
        payload: {
          finalizedGameId: finalized.game.id,
          rowCount: rows.length,
          adjustmentCount: adjustments.length,
        },
        clientEventId: args.clientEventId,
        createdAt: now,
      }),
    ]);
    return { game: finalized, redirectPath: `/g/${finalized.game.id}` };
  } catch (err) {
    await db
      .prepare(
        `UPDATE live_games
         SET status = 'active', version = version + 1, updated_at = ?
         WHERE id = ? AND status = 'finalizing'`
      )
      .bind(Date.now(), args.gameId)
      .run();
    throw err;
  }
}

function validateEntryInput(
  snapshot: LiveGameSnapshot,
  args: {
    playerId: string;
    entryType: LiveEntryType;
    amountCents: number;
    toPlayerId?: string | null;
    paymentMethod?: LivePaymentMethod | null;
    isFinal?: boolean;
  }
): void {
  if (!['buy_in', 'cash_out', 'prior_payment'].includes(args.entryType)) {
    throw new LiveValidationError('Invalid entry type.');
  }
  assertCents(args.amountCents, 'amountCents', args.entryType === 'cash_out');
  const player = snapshot.players.find((p) => p.playerId === args.playerId);
  if (!player || player.status === 'removed') {
    throw new LiveValidationError('Player must exist and not be removed.');
  }
  if (args.paymentMethod && !PAYMENT_METHODS.has(args.paymentMethod)) {
    throw new LiveValidationError('Invalid payment method.');
  }
  if (args.entryType === 'prior_payment') {
    if (!args.toPlayerId) {
      throw new LiveValidationError('Prior payment requires toPlayerId.');
    }
    if (args.toPlayerId === args.playerId) {
      throw new LiveValidationError('Prior payment payer and recipient must differ.');
    }
    const target = snapshot.players.find((p) => p.playerId === args.toPlayerId);
    if (!target || target.status === 'removed') {
      throw new LiveValidationError('Prior payment recipient must be in this live game.');
    }
  }
  if (args.entryType !== 'prior_payment' && args.toPlayerId) {
    throw new LiveValidationError('Only prior payments may set toPlayerId.');
  }
  if (args.entryType === 'cash_out' && args.isFinal === true) {
    ensureNoFinalCashout(snapshot, args.playerId);
  }
}

function ensureNoFinalCashout(snapshot: LiveGameSnapshot, playerId: string): void {
  const alreadyFinal = snapshot.entries.some(
    (entry) =>
      entry.playerId === playerId &&
      entry.entryType === 'cash_out' &&
      entry.isFinal &&
      entry.voidedAt === null
  );
  if (alreadyFinal) {
    throw new LiveValidationError('Player already has a final cashout.');
  }
}

function statusUpdateForEntry(
  db: D1Database,
  gameId: string,
  playerId: string,
  entryType: LiveEntryType,
  amountCents: number,
  isFinal: boolean,
  now: number
): D1PreparedStatement {
  if (entryType === 'cash_out' && isFinal) {
    return db
      .prepare(
        `UPDATE live_players
         SET status = ?, updated_at = ?
         WHERE game_id = ? AND player_id = ?`
      )
      .bind(amountCents === 0 ? 'busted' : 'cashed_out', now, gameId, playerId);
  }
  if (entryType === 'buy_in') {
    return db
      .prepare(
        `UPDATE live_players
         SET status = CASE WHEN status IN ('busted', 'cashed_out') THEN 'active' ELSE status END,
             updated_at = ?
         WHERE game_id = ? AND player_id = ?`
      )
      .bind(now, gameId, playerId);
  }
  return noopStmt(db);
}

function recalcPlayerStatusStmt(
  db: D1Database,
  gameId: string,
  playerId: string,
  now: number
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE live_players
       SET status = COALESCE(
         (
           SELECT CASE WHEN amount_cents = 0 THEN 'busted' ELSE 'cashed_out' END
           FROM live_entries
           WHERE game_id = ?
             AND player_id = ?
             AND entry_type = 'cash_out'
             AND is_final = 1
             AND voided_at IS NULL
           ORDER BY created_at DESC
           LIMIT 1
         ),
         CASE WHEN status IN ('busted', 'cashed_out') THEN 'active' ELSE status END
       ),
       updated_at = ?
       WHERE game_id = ? AND player_id = ?`
    )
    .bind(gameId, playerId, now, gameId, playerId);
}

function bumpLiveGameStmt(
  db: D1Database,
  gameId: string,
  now: number
): D1PreparedStatement {
  return db
    .prepare('UPDATE live_games SET version = version + 1, updated_at = ? WHERE id = ?')
    .bind(now, gameId);
}

function liveAuditStmt(
  db: D1Database,
  args: {
    gameId: string;
    action: LiveAuditAction;
    actorLabel: string | null;
    payload: unknown;
    clientEventId: string | null;
    createdAt: number;
  }
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO live_audit_log
        (id, game_id, action, actor_label, payload, client_event_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      newId('lal_'),
      args.gameId,
      args.action,
      args.actorLabel,
      JSON.stringify(args.payload ?? {}),
      args.clientEventId,
      args.createdAt
    );
}

function noopStmt(db: D1Database): D1PreparedStatement {
  return db.prepare('SELECT 1');
}

async function batchIdempotent(
  db: D1Database,
  stmts: D1PreparedStatement[],
  _gameId: string
): Promise<void> {
  try {
    await db.batch(stmts);
  } catch (err) {
    const message = (err as Error).message ?? '';
    if (/UNIQUE/i.test(message) && /client_event_id/i.test(message)) {
      return;
    }
    throw err;
  }
}
