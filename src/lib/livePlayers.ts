import type { LiveGameSnapshot, LivePlayer, LivePlayerSummary } from './types';

export function activeLivePlayers(snapshot: LiveGameSnapshot): LivePlayer[] {
  return snapshot.players
    .filter((player) => player.status !== 'removed')
    .slice()
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a.name.localeCompare(b.name) ||
        a.playerId.localeCompare(b.playerId)
    );
}

export interface SendLossToHostOffer {
  hostPlayerId: string;
  hostName: string;
  /** Remaining loss in cents. Always positive. */
  amountCents: number;
}

/**
 * One-tap "send loss to host" eligibility: offered only after a player's
 * final cashout, while they still owe money into the pool. Gated on the
 * player's CURRENT status (not just the final-cashout flag) so a rebuy
 * after a final cashout — which reactivates the player — withdraws the
 * offer until they are done playing again.
 *
 * The amount follows the `applyAdjustments` sign convention — a prior
 * payment raises the payer's effective net and lowers the recipient's — so
 *   outstanding = -(net + paidOut - received)
 * and the offer always equals the loss that settlement would still ask
 * this player to pay, not the raw table net.
 */
export function sendLossToHostOffer(
  snapshot: LiveGameSnapshot,
  summary: LivePlayerSummary
): SendLossToHostOffer | null {
  if (snapshot.game.status !== 'active') return null;
  const hostPlayerId = snapshot.game.hostPlayerId;
  if (!hostPlayerId || hostPlayerId === summary.playerId) return null;
  const host = snapshot.players.find((player) => player.playerId === hostPlayerId);
  if (!host || host.status === 'removed') return null;
  if (summary.status !== 'cashed_out' && summary.status !== 'busted') return null;
  if (!summary.hasFinalCashout) return null;
  const outstandingCents =
    -summary.netCents - summary.priorPaymentCents + summary.priorReceivedCents;
  if (outstandingCents <= 0) return null;
  return { hostPlayerId, hostName: host.name, amountCents: outstandingCents };
}
