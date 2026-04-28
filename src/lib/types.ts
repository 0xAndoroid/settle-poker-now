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

/** A constrained-settlement group: members may transact only within the group. */
export interface Group {
  id: string;
  /** Player IDs assigned to this group. */
  memberIds: string[];
}

/** A single settlement transaction proposed by the algorithm. */
export interface SettlementTxn {
  fromId: string;
  toId: string;
  amountCents: number;
}

export interface GroupSettlement {
  groupId: string;
  /** True if sum of nets in group ≠ 0 → cannot be settled internally. */
  isImbalanced: boolean;
  /** Net imbalance in cents (sum of nets within the group). */
  imbalanceCents: number;
  txns: SettlementTxn[];
}

export interface SettlementPlan {
  groups: GroupSettlement[];
  /** Flat union of all txns across all groups. */
  txns: SettlementTxn[];
  /** True if every group balances to zero. */
  isFullyBalanced: boolean;
  /** Total cents that cannot be settled because of group imbalance. */
  totalImbalanceCents: number;
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
