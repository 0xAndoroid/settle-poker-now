/**
 * Pure helpers for projecting persisted game data into the same view models
 * the in-memory components use.
 *
 * Extracted out of `PersistentGameView` so the logic is testable without a
 * DOM. Mirrors what `functions/lib/db.ts` does on the server side.
 */

import { OPTIMAL_PARTITION_LIMIT } from './settle';
import { buildCanonicalMap, canonicalOf } from './aliases';
import type {
  EffectiveBalance,
  IsolationRule,
  LedgerRow,
  PersistedGameSnapshot,
  PersistedPlayer,
  SettlementAlgorithm,
  SettlementPlan,
  SettlementTxn,
} from './types';

export interface PersistedLedgerAdjustment {
  playerId: string;
  amountCents: number;
  basisCents: number;
}

export interface PersistedSnapshotProjection {
  /** Ledger rows shown in the finalized view. Live games may carry adjusted nets. */
  originalRows: LedgerRow[];
  /**
   * Same player set as `originalRows` but in EffectiveBalance shape. For live
   * games, originalNet can be the raw cashout net while effectiveNet is the
   * proportional settlement net persisted at finalization.
   */
  originalBalances: EffectiveBalance[];
  /**
   * Post-modification balances used by payment rows for nickname lookup after
   * aliases collapse the roster.
   */
  balances: EffectiveBalance[];
  proportionalAdjustments: PersistedLedgerAdjustment[];
  plan: SettlementPlan;
}

/**
 * Detect cycles in the player → counterpart graph. A cycle is any chain
 * that revisits a node, including self-loops (player → themselves) and
 * longer rings (A → B → C → A).
 */
export function findIsolationCycles(rules: ReadonlyArray<IsolationRule>): string[] {
  const parent = new Map<string, string>();
  for (const r of rules) parent.set(r.playerId, r.counterpartId);
  const cycles = new Set<string>();
  for (const start of parent.keys()) {
    if (cycles.has(start)) continue;
    const visited = new Set<string>();
    const chain: string[] = [];
    let current: string | undefined = start;
    while (current !== undefined) {
      if (visited.has(current)) {
        const idx = chain.indexOf(current);
        for (const id of chain.slice(idx)) cycles.add(id);
        break;
      }
      visited.add(current);
      chain.push(current);
      current = parent.get(current);
    }
  }
  return Array.from(cycles).sort();
}

/**
 * Stable key for matching server payments across plan re-derivations. When
 * the algorithm produces the same (from, to, amount) tuple, completion
 * state should carry over. Mirrors the server-side helper in db.ts.
 */
export function paymentKey(t: { fromId: string; toId: string; amountCents: number }): string {
  return `${t.fromId}|${t.toId}|${t.amountCents}`;
}

export function projectPersistedSnapshot(snap: PersistedGameSnapshot): PersistedSnapshotProjection {
  const originalRows: LedgerRow[] = snap.players.map((p) => ({
    playerId: p.playerId,
    nickname: p.nickname,
    netCents: p.netCents,
    buyInCents: p.buyInCents ?? 0,
    buyOutCents: p.buyOutCents ?? 0,
  }));
  const originalBalances: EffectiveBalance[] = snap.players.map((p) => ({
    playerId: p.playerId,
    nickname: p.nickname,
    originalNetCents: originalNetCents(p),
    effectiveNetCents: p.netCents,
  }));

  const canonical = buildCanonicalMap(snap.aliases);
  const playersById = new Map(snap.players.map((p) => [p.playerId, p]));
  const balances: EffectiveBalance[] = snap.players
    .filter((p) => canonicalOf(p.playerId, canonical) === p.playerId)
    .map((p) => ({
      playerId: p.playerId,
      nickname: playersById.get(canonicalOf(p.playerId, canonical))?.nickname ?? p.nickname,
      originalNetCents: originalNetCents(p),
      effectiveNetCents: p.netCents,
    }));

  for (const source of snap.players) {
    const targetId = canonicalOf(source.playerId, canonical);
    if (targetId === source.playerId) continue;
    const target = balances.find((b) => b.playerId === targetId);
    if (!target) continue;
    target.originalNetCents += originalNetCents(source);
    target.effectiveNetCents += source.netCents;
  }

  for (const adj of snap.adjustments) {
    const fromId = canonicalOf(adj.fromPlayerId, canonical);
    const toId = canonicalOf(adj.toPlayerId, canonical);
    if (fromId === toId) continue;
    const from = balances.find((b) => b.playerId === fromId);
    const to = balances.find((b) => b.playerId === toId);
    if (!from || !to) continue;
    from.effectiveNetCents += adj.amountCents;
    to.effectiveNetCents -= adj.amountCents;
  }

  const proportionalAdjustments = snap.players
    .map((p) => ({
      playerId: p.playerId,
      amountCents: p.netCents - originalNetCents(p),
      basisCents: p.buyOutCents ?? 0,
    }))
    .filter((adj) => adj.amountCents !== 0);

  return {
    originalRows,
    originalBalances,
    balances,
    proportionalAdjustments,
    plan: projectSettlementPlan(snap),
  };
}

/**
 * Convert a raw persisted snapshot into a `SettlementPlan` view model.
 * Used by the persistent UI to feed the existing components.
 */
export function projectSettlementPlan(snap: PersistedGameSnapshot): SettlementPlan {
  const txns: SettlementTxn[] = snap.payments.map((p) => ({
    fromId: p.fromPlayerId,
    toId: p.toPlayerId,
    amountCents: p.amountCents,
    forced: p.forced,
  }));

  const cyclePlayerIds = findIsolationCycles(
    snap.isolations.map((r) => ({
      playerId: r.playerId,
      counterpartId: r.counterpartId,
    }))
  );

  // Estimate which algorithm the server used, based on the number of
  // distinct non-zero-net players. Mirrors the threshold in
  // `buildSettlementPlan`. Purely informational — used to label the UI
  // ("3 payments — minimum" vs "5 payments — greedy fallback").
  const nonZeroPlayers = snap.players.filter((p) => p.netCents !== 0).length;
  const algorithm: SettlementAlgorithm =
    nonZeroPlayers > OPTIMAL_PARTITION_LIMIT ? 'greedy-fallback' : 'optimal';

  return {
    txns,
    isFullyBalanced: cyclePlayerIds.length === 0,
    residueCents: 0,
    cyclePlayerIds,
    appliedIsolations: snap.isolations.map((r) => ({
      playerId: r.playerId,
      counterpartId: r.counterpartId,
    })),
    algorithm,
    // We don't have the partition info from the server's persisted plan.
    // Default to a value that won't mislead a UI consumer.
    subsetCount: algorithm === 'optimal' ? 1 : 1,
    paymentPreferenceStatus: {
      applied: false,
      reason: 'none',
      venmoPlayerIds: [],
      zellePlayerIds: [],
    },
  };
}

function originalNetCents(player: PersistedPlayer): number {
  if (player.buyInCents !== null && player.buyInCents !== undefined) {
    const buyOutCents = player.buyOutCents ?? 0;
    return buyOutCents - player.buyInCents;
  }
  return player.netCents;
}
