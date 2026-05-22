/**
 * Domain types for settle-poker-now.
 *
 * Money is represented in INTEGER CENTS throughout the algorithm layer to avoid
 * floating-point drift. Conversion to dollar floats happens only at the
 * presentation boundary.
 */

export interface LedgerRow {
  /** Stable PokerNow player identity. */
  playerId: string;
  /** Display name (most-recent nickname seen for this player_id). */
  nickname: string;
  /** Net for the session, in integer cents. Positive = won, negative = lost. */
  netCents: number;
  /** Total buy-in in cents (informational, not used by settlement algo). */
  buyInCents: number;
  /** Total buy-out + remaining stack in cents. */
  buyOutCents: number;
}

/**
 * Unit a PokerNow ledger reports values in. Cents-mode is the default for
 * games with sub-dollar play; dollars-mode is used by hosts who disable
 * cents in the game settings.
 */
export type LedgerUnit = 'cents' | 'dollars';
export type SourceKind = 'pokernow' | 'live';

export interface ParsedLedger {
  rows: LedgerRow[];
  /** Earliest session_start_at across all rows. */
  startedAt: Date | null;
  /** Latest session_end_at across all rows. */
  endedAt: Date | null;
  /** The unit the ledger CSV reported `net`/`buy_in` in. */
  unit: LedgerUnit;
  /** True when `unit` was inferred from a heuristic, false when supplied authoritatively. */
  unitWasInferred: boolean;
}

/** A pre-existing transfer the user already settled outside the app. */
export interface Adjustment {
  id: string;
  /** Player who paid. */
  fromId: string;
  /** Player who received. */
  toId: string;
  /** Amount in integer cents. Always positive. */
  amountCents: number;
}

/**
 * Per-player isolation rule.
 *
 * "Player {playerId} only settles with {counterpartId}." The isolated player
 * is removed from the open settlement pool and their net is folded into the
 * counterpart's net (the counterpart absorbs the obligation). Hub-and-spoke
 * topology: many isolated players can orbit a single counterpart, who then
 * settles freely with everyone else.
 *
 * Cycles (A → B, B → A; or A → B → C → A) are rejected by the planner.
 */
export interface IsolationRule {
  /** The player being isolated. Each player can have at most one rule. */
  playerId: string;
  /** Counterpart who absorbs this player's net. */
  counterpartId: string;
}

export type PaymentRail = 'venmo' | 'zelle';

/** Player-level payment rail preference used while deriving a plan. */
export interface PaymentPreference {
  playerId: string;
  rail: PaymentRail;
}

/** A single settlement transaction proposed by the algorithm. */
export interface SettlementTxn {
  fromId: string;
  toId: string;
  amountCents: number;
  /** Provenance — was this transaction forced by an isolation rule? */
  forced?: boolean;
}

/**
 * Which algorithm produced the residual settlement.
 *   - `optimal`  → bitmask-DP subset-sum partition; provably min-txns.
 *   - `greedy`   → max-creditor↔max-debtor heuristic; ≤ N−1 txns.
 *   - `greedy-fallback` → optimal would have been used but the pool
 *     exceeded the size threshold; we fell back to greedy. Surfaced
 *     in the UI ("settled with a greedy fallback for tables > 15").
 */
export type SettlementAlgorithm = 'optimal' | 'greedy' | 'greedy-fallback';

/** Output of the planner. */
export interface SettlementPlan {
  txns: SettlementTxn[];
  /** True if the plan settles every player to zero net. */
  isFullyBalanced: boolean;
  /** Any unsettleable residue (cents) — non-zero only when the ledger itself doesn't balance. */
  residueCents: number;
  /** Players involved in cyclic isolation chains — rejected before settlement. */
  cyclePlayerIds: string[];
  /** Isolation rules that were applied (no cycles, both players exist). */
  appliedIsolations: IsolationRule[];
  /** Which algorithm settled the residual non-isolated pool. */
  algorithm: SettlementAlgorithm;
  /** Number of zero-sum subsets the residual pool partitioned into (optimal only — `1` for greedy/greedy-fallback). */
  subsetCount: number;
  /** Preference split metadata for the residual non-isolated pool. */
  paymentPreferenceStatus: {
    applied: boolean;
    reason: 'none' | 'applied' | 'unbalanced';
    venmoPlayerIds: string[];
    zellePlayerIds: string[];
  };
}

/** Effective per-player balances after applying adjustments. */
export interface EffectiveBalance {
  playerId: string;
  nickname: string;
  /** Original session net in cents. */
  originalNetCents: number;
  /** Net after adjustments are applied. */
  effectiveNetCents: number;
}

/* ──────── Persistent game — wire types shared with the worker ──────── */

export type UnitProvenance = 'header' | 'heuristic' | 'user';

export interface PersistedGame {
  id: string;
  pokernowGameId: string;
  sourceKind?: SourceKind;
  sourceUnit: LedgerUnit;
  unitProvenance: UnitProvenance;
  startedAt: number | null;
  endedAt: number | null;
  createdAt: number;
  updatedAt: number;
  /** ms since epoch when the game was finalized (locked); null when still editable. */
  finalizedAt: number | null;
  /** Actor label of whoever finalized; null when not finalized. */
  finalizedBy: string | null;
  /**
   * Free-text per-game note (Venmo deep-link `note=` param). Null when
   * unset; the UI falls back to "dinner".
   */
  note: string | null;
}

export interface PersistedPlayer {
  playerId: string;
  nickname: string;
  netCents: number;
  buyInCents?: number | null;
  buyOutCents?: number | null;
}

export interface PersistedPayment {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  amountCents: number;
  forced: boolean;
  position: number;
  completedAt: number | null;
  completedBy: string | null;
}

export interface PersistedAdjustment {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  amountCents: number;
  createdAt: number;
  createdBy: string | null;
}

export interface PersistedIsolation {
  playerId: string;
  counterpartId: string;
  createdAt: number;
}

export interface PersistedAlias {
  /** The duplicate player_id (disappears from the active roster). */
  playerId: string;
  /** Canonical target — never points at another aliased player (chain-compressed on write). */
  aliasToPlayerId: string;
  createdAt: number;
  createdBy: string | null;
}

/**
 * Per-game Venmo / Zelle handles for a player. Used to render
 * deep-link icons next to settlement rows where this player is the
 * recipient. Either side may be null.
 */
export interface PersistedPaymentMethod {
  playerId: string;
  /** Without leading '@'. */
  venmoUsername: string | null;
  /**
   * Free-text Zelle handle (email, US phone, or whatever the recipient's
   * bank app accepts). Stored verbatim — we don't try to discriminate.
   */
  zelleHandle: string | null;
  updatedAt: number;
  updatedBy: string | null;
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

export interface PersistedAuditEntry {
  id: string;
  action: AuditAction;
  actorLabel: string | null;
  payload: unknown;
  createdAt: number;
}

export interface PersistedGameSnapshot {
  game: PersistedGame;
  players: PersistedPlayer[];
  payments: PersistedPayment[];
  adjustments: PersistedAdjustment[];
  isolations: PersistedIsolation[];
  aliases: PersistedAlias[];
  paymentMethods: PersistedPaymentMethod[];
  audit: PersistedAuditEntry[];
}

/* ──────── Live game — wire types shared with the worker ──────── */

export type LiveGameStatus = 'active' | 'finalizing' | 'finalized' | 'abandoned';
export type LivePlayerStatus = 'active' | 'cashed_out' | 'busted' | 'removed';
export type LiveEntryType = 'buy_in' | 'cash_out' | 'prior_payment';
export type LivePaymentMethod = 'cash' | 'venmo' | 'zelle' | 'other';
export type LiveChipCheckpointType =
  | 'set_bank_total'
  | 'verify_table_count'
  | 'verify_bank_count';

export interface LiveGame {
  id: string;
  status: LiveGameStatus;
  hostPlayerId: string | null;
  title: string | null;
  note: string | null;
  totalChipBankCents: number | null;
  version: number;
  createdAt: number;
  updatedAt: number;
  finalizedAt: number | null;
  finalizedGameId: string | null;
}

export interface LivePlayer {
  gameId: string;
  playerId: string;
  name: string;
  isHost: boolean;
  status: LivePlayerStatus;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface LiveEntry {
  id: string;
  gameId: string;
  playerId: string;
  entryType: LiveEntryType;
  amountCents: number;
  toPlayerId: string | null;
  paymentMethod: LivePaymentMethod | null;
  isFinal: boolean;
  note: string | null;
  clientEventId: string;
  createdAt: number;
  createdBy: string | null;
  voidedAt: number | null;
  voidedBy: string | null;
  voidReason: string | null;
}

export interface LiveChipCheckpoint {
  id: string;
  gameId: string;
  checkpointType: LiveChipCheckpointType;
  amountCents: number;
  expectedCents: number | null;
  deltaCents: number | null;
  note: string | null;
  clientEventId: string;
  createdAt: number;
  createdBy: string | null;
}

export type LiveAuditAction =
  | 'create_live_game'
  | 'add_player'
  | 'update_player'
  | 'set_host'
  | 'void_entry'
  | 'busted_paid_host'
  | 'force_finalize'
  | 'finalize_live_game'
  | 'abandon_live_game';

export interface LiveAuditEntry {
  id: string;
  action: LiveAuditAction;
  actorLabel: string | null;
  payload: unknown;
  clientEventId: string | null;
  createdAt: number;
}

export interface LivePlayerSummary {
  playerId: string;
  name: string;
  isHost: boolean;
  status: LivePlayerStatus;
  buyInCents: number;
  cashOutCents: number;
  priorPaymentCents: number;
  priorReceivedCents: number;
  netCents: number;
  entryCount: number;
  hasActivity: boolean;
  hasFinalCashout: boolean;
  finalCashoutCents: number | null;
  lastEntryAt: number | null;
}

export interface LiveBankSummary {
  totalChipBankCents: number | null;
  chipsInPlayCents: number;
  expectedBankOnHandCents: number | null;
  latestTableCountCents: number | null;
  latestTableExpectedCents: number | null;
  latestTableDeltaCents: number | null;
  latestBankCountCents: number | null;
  latestBankExpectedCents: number | null;
  latestBankDeltaCents: number | null;
}

export interface LiveGameSnapshot {
  game: LiveGame;
  players: LivePlayer[];
  entries: LiveEntry[];
  chipCheckpoints: LiveChipCheckpoint[];
  audit: LiveAuditEntry[];
  playerSummaries: LivePlayerSummary[];
  bankSummary: LiveBankSummary;
}

export interface LiveFinalizationCheck {
  key: string;
  label: string;
  ok: boolean;
  blocking: boolean;
  detail: string | null;
}

export interface LiveFinalizationValidation {
  ok: boolean;
  checks: LiveFinalizationCheck[];
  errors: string[];
  warnings: string[];
  rows: LedgerRow[];
  adjustments: Adjustment[];
}
