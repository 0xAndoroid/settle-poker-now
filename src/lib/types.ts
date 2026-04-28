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

export interface ParsedLedger {
  rows: LedgerRow[];
  /** Earliest session_start_at across all rows. */
  startedAt: Date | null;
  /** Latest session_end_at across all rows. */
  endedAt: Date | null;
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

/** A single settlement transaction proposed by the algorithm. */
export interface SettlementTxn {
  fromId: string;
  toId: string;
  amountCents: number;
  /** Provenance — was this transaction forced by an isolation rule? */
  forced?: boolean;
}

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
