/**
 * Pure helpers for projecting persisted game data into the same view models
 * the in-memory components use.
 *
 * Extracted out of `PersistentGameView` so the logic is testable without a
 * DOM. Mirrors what `functions/lib/db.ts` does on the server side.
 */

import { OPTIMAL_PARTITION_LIMIT } from './settle';
import type {
  IsolationRule,
  PersistedGameSnapshot,
  SettlementAlgorithm,
  SettlementPlan,
  SettlementTxn,
} from './types';

/**
 * Detect cycles in the player → counterpart graph. A cycle is any chain
 * that revisits a node, including self-loops (player → themselves) and
 * longer rings (A → B → C → A).
 */
export function findIsolationCycles(
  rules: ReadonlyArray<IsolationRule>
): string[] {
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
export function paymentKey(t: {
  fromId: string;
  toId: string;
  amountCents: number;
}): string {
  return `${t.fromId}|${t.toId}|${t.amountCents}`;
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
  };
}
