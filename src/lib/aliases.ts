/**
 * Player alias collapse — fold a duplicate `player_id` into another so
 * the active roster shrinks by one. Multiple players can alias to the
 * same target (hub-and-spoke). Aliases form a forest because we
 * canonicalize on write (X → Y → Z is stored as X → Z directly).
 *
 * Pure helpers; both the server (functions/lib/db.ts) and client view
 * model (src/lib/persistedProjection.ts) call into these so the same
 * collapse logic backs both ledgers.
 */

import type {
  Adjustment,
  IsolationRule,
  LedgerRow,
  PersistedAlias,
} from './types';

/** Bare structural shape of an alias rule. */
export interface AliasRule {
  playerId: string;
  aliasToPlayerId: string;
}

/**
 * Walk the alias graph from `start` and return the canonical target.
 * On a cycle (or self-loop) returns `null`. Pure function — does not
 * mutate. Used by `addAlias` to compress chains on write AND by the
 * server side's idempotent guard.
 */
export function canonicalize(
  start: string,
  aliases: Map<string, string>
): string | null {
  const visited = new Set<string>();
  let current = start;
  while (true) {
    if (visited.has(current)) return null; // cycle
    visited.add(current);
    const next = aliases.get(current);
    if (next === undefined) return current;
    if (next === current) return null; // self-loop, defensive
    current = next;
  }
}

/**
 * Build the canonical resolver from a snapshot of stored aliases. The
 * resulting map sends every alias source to its (chain-compressed) hub.
 * Players not present in the map are their own canonical.
 */
export function buildCanonicalMap(
  aliases: ReadonlyArray<AliasRule | PersistedAlias>
): Map<string, string> {
  const direct = new Map<string, string>();
  for (const a of aliases) {
    const playerId = (a as AliasRule).playerId;
    const target =
      (a as AliasRule).aliasToPlayerId ?? (a as PersistedAlias).aliasToPlayerId;
    if (playerId === target) continue;
    direct.set(playerId, target);
  }
  // Compress every entry to the terminal canonical (defensive — they
  // *should* already be one hop after on-write canonicalization, but
  // multi-hop traversal is cheap and keeps reads correct in legacy data).
  const compressed = new Map<string, string>();
  for (const [k] of direct) {
    const c = canonicalize(k, direct);
    if (c !== null && c !== k) compressed.set(k, c);
  }
  return compressed;
}

/** Resolve a player id through the canonical map; identity if absent. */
export function canonicalOf(
  playerId: string,
  canonical: ReadonlyMap<string, string>
): string {
  return canonical.get(playerId) ?? playerId;
}

/* ──────── Collapse helpers ──────── */

/**
 * Fold aliased ledger rows into their canonical target. Net is summed;
 * the most-recent nickname (by latest-net non-zero or first-seen)
 * survives. Source players are dropped from the output.
 */
export function collapseRows(
  rows: ReadonlyArray<LedgerRow>,
  canonical: ReadonlyMap<string, string>
): LedgerRow[] {
  const byCanonical = new Map<string, LedgerRow>();
  // First pass: copy non-aliased players into the map keyed by their own id.
  // Second pass: fold aliased players into their target.
  // We do this in one pass by always writing under canonicalOf().
  for (const row of rows) {
    const canonId = canonicalOf(row.playerId, canonical);
    const existing = byCanonical.get(canonId);
    if (!existing) {
      byCanonical.set(canonId, {
        ...row,
        playerId: canonId,
        // Keep the canonical's own nickname when it exists; otherwise
        // fall back to the alias source's. We refine below.
      });
    } else {
      existing.netCents += row.netCents;
      existing.buyInCents += row.buyInCents;
      existing.buyOutCents += row.buyOutCents;
    }
  }
  // Pass: replace each canonical's nickname with the canonical's own
  // nickname (the row whose playerId equals canonId in the input).
  for (const row of rows) {
    if (row.playerId === canonicalOf(row.playerId, canonical)) {
      const canonical = byCanonical.get(row.playerId);
      if (canonical) canonical.nickname = row.nickname;
    }
  }
  return Array.from(byCanonical.values());
}

/**
 * Rewrite each adjustment's `from` and `to` to their canonical IDs. Drop
 * adjustments where source and target collapse onto the same canonical
 * (they become net no-ops).
 */
export function collapseAdjustments(
  adjustments: ReadonlyArray<Adjustment>,
  canonical: ReadonlyMap<string, string>
): Adjustment[] {
  const out: Adjustment[] = [];
  for (const a of adjustments) {
    const fromId = canonicalOf(a.fromId, canonical);
    const toId = canonicalOf(a.toId, canonical);
    if (fromId === toId) continue;
    out.push({ ...a, fromId, toId });
  }
  return out;
}

/**
 * Rewrite isolation rules through the canonical map. If multiple
 * aliased players' rules collapse onto the same canonical playerId, we
 * prefer the rule that was written against the canonical itself (i.e.
 * `playerId === canonicalOf(playerId)`); otherwise the first one
 * surviving is kept. Self-loops (canonical of player == canonical of
 * counterpart) are dropped — they would have been cycles anyway.
 *
 * Returns `{ rules, dropped }`. `dropped` carries IDs of original
 * `playerId`s whose rule was discarded due to a collision so the UI
 * can surface a warning.
 */
export function collapseIsolations(
  rules: ReadonlyArray<IsolationRule>,
  canonical: ReadonlyMap<string, string>
): { rules: IsolationRule[]; dropped: string[] } {
  // Track each candidate alongside the ORIGINAL playerId that authored
  // it, so when a collision occurs we can put the loser's untranslated
  // id into `dropped` (the UI surfaces those for warnings).
  interface Candidate {
    rule: IsolationRule;
    originalPlayerId: string;
    isOwn: boolean;
  }
  const out = new Map<string, Candidate>();
  const dropped: string[] = [];
  for (const r of rules) {
    const playerId = canonicalOf(r.playerId, canonical);
    const counterpartId = canonicalOf(r.counterpartId, canonical);
    if (playerId === counterpartId) {
      dropped.push(r.playerId);
      continue;
    }
    const isOwn = r.playerId === playerId;
    const existing = out.get(playerId);
    if (!existing) {
      out.set(playerId, {
        rule: { playerId, counterpartId },
        originalPlayerId: r.playerId,
        isOwn,
      });
      continue;
    }
    // Collision: prefer the canonical-authored rule. If existing is
    // canonical's own rule, drop the new one. Else if the new one is
    // canonical's own, overwrite and drop the existing (recording its
    // original playerId in `dropped`). Else first-write-wins.
    if (existing.isOwn) {
      dropped.push(r.playerId);
    } else if (isOwn) {
      dropped.push(existing.originalPlayerId);
      out.set(playerId, {
        rule: { playerId, counterpartId },
        originalPlayerId: r.playerId,
        isOwn: true,
      });
    } else {
      dropped.push(r.playerId);
    }
  }
  return {
    rules: Array.from(out.values()).map((c) => c.rule),
    dropped,
  };
}
