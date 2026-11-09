import { formatDollars } from './money';
import type { LedgerBalancing, LedgerRow, LiveProportionalAdjustment } from './types';

export const DEFAULT_LEDGER_BALANCING: LedgerBalancing = { method: 'winnings' };

export class LedgerBalancingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerBalancingValidationError';
  }
}

export function parseLedgerBalancing(value: unknown): LedgerBalancing {
  if (value === undefined) return DEFAULT_LEDGER_BALANCING;
  if (typeof value === 'object' && value !== null && 'method' in value) {
    if (value.method === 'winnings' || value.method === 'cashout') {
      return { method: value.method };
    }
    if (
      value.method === 'player' &&
      'playerId' in value &&
      typeof value.playerId === 'string' &&
      value.playerId.length > 0
    ) {
      return { method: 'player', playerId: value.playerId };
    }
  }
  throw new LedgerBalancingValidationError(
    'Choose winnings, cash-out, or a player to balance the ledger.'
  );
}

export function balanceFinalLedgerRows(
  rows: ReadonlyArray<LedgerRow>,
  balancing: LedgerBalancing = DEFAULT_LEDGER_BALANCING
): { rows: LedgerRow[]; proportionalAdjustments: LiveProportionalAdjustment[] } {
  const out = rows.map((row) => ({ ...row }));
  const sumCents = out.reduce((acc, row) => acc + row.netCents, 0);
  if (sumCents === 0) return { rows: out, proportionalAdjustments: [] };

  const candidates = out
    .map((row, index) => ({
      index,
      basisCents:
        balancing.method === 'player'
          ? Number(row.playerId === balancing.playerId)
          : balancing.method === 'cashout'
            ? row.buyOutCents
            : Math.sign(sumCents) * row.netCents,
    }))
    .filter((candidate) => candidate.basisCents > 0);
  // Cash-out can have no positive payouts; a selected player can leave the ledger.
  // Returning the raw imbalance lets finalization reject either unresolved choice.
  if (candidates.length === 0) return { rows: out, proportionalAdjustments: [] };

  const totalBasis = candidates.reduce((acc, candidate) => acc + candidate.basisCents, 0);
  const totalAbs = Math.abs(sumCents);
  const shares = candidates.map((candidate) => {
    const raw = totalAbs * candidate.basisCents;
    return {
      ...candidate,
      amountAbs: Math.floor(raw / totalBasis),
      remainder: raw % totalBasis,
    };
  });
  const assignedAbs = shares.reduce((acc, share) => acc + share.amountAbs, 0);
  const remainderCount = totalAbs - assignedAbs;
  const byRemainder = shares
    .slice()
    .sort((a, b) => {
      const aId = out[a.index]!.playerId;
      const bId = out[b.index]!.playerId;
      return b.remainder - a.remainder || (aId < bId ? -1 : aId > bId ? 1 : 0);
    });
  for (let i = 0; i < remainderCount; i++) byRemainder[i % byRemainder.length]!.amountAbs += 1;

  const proportionalAdjustments: LiveProportionalAdjustment[] = [];
  for (const share of shares) {
    if (share.amountAbs === 0) continue;
    const amountCents = -Math.sign(sumCents) * share.amountAbs;
    const row = out[share.index]!;
    row.netCents += amountCents;
    proportionalAdjustments.push({ playerId: row.playerId, amountCents });
  }
  return { rows: out, proportionalAdjustments };
}

export function ledgerBalancingLabel(
  balancing: LedgerBalancing,
  rawDeltaCents: number,
  players: ReadonlyArray<{ playerId: string; nickname: string }>
): string {
  if (balancing.method === 'cashout') return 'split in proportion to cash-outs';
  if (balancing.method === 'player') {
    return `assigned entirely to ${players.find((p) => p.playerId === balancing.playerId)?.nickname ?? balancing.playerId}`;
  }
  return rawDeltaCents > 0
    ? 'split among winners in proportion to their winnings'
    : 'split among losers in proportion to their losses';
}

export function formatImbalanceConfirmation(
  rawDeltaCents: number,
  balancing: LedgerBalancing,
  players: ReadonlyArray<{ playerId: string; nickname: string }>
): string | null {
  if (rawDeltaCents === 0) return null;
  const amount = formatDollars(Math.abs(rawDeltaCents));
  const difference = rawDeltaCents > 0 ? 'missing' : 'surplus';
  return `There's ${amount} ${difference}. The correction will be ${ledgerBalancingLabel(balancing, rawDeltaCents, players)}.`;
}
