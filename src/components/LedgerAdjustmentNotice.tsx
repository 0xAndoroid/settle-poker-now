import { formatDollars } from '@/lib/money';
import type { PersistedLedgerAdjustment } from '@/lib/persistedProjection';
import type { PersistedGameSnapshot } from '@/lib/types';
import { ledgerBalancingLabel } from '@/lib/ledgerBalancing';

interface LedgerAdjustmentNoticeProps {
  adjustments: PersistedLedgerAdjustment[];
  players: PersistedGameSnapshot['players'];
  balancing?: PersistedGameSnapshot['game']['ledgerBalancing'];
}

export function LedgerAdjustmentNotice({ adjustments, players, balancing }: LedgerAdjustmentNoticeProps) {
  const nameById = new Map(players.map((player) => [player.playerId, player.nickname]));
  const rawDeltaCents = -adjustments.reduce((acc, adjustment) => acc + adjustment.amountCents, 0);
  const rawDeltaLabel =
    rawDeltaCents > 0
      ? `${formatDollars(Math.abs(rawDeltaCents))} missing`
      : `${formatDollars(Math.abs(rawDeltaCents))} surplus`;

  return (
    <section className="card" aria-label="Ledger adjustment">
      <div className="card-header">
        <span className="ticker-label-strong">ledger adjustment</span>
      </div>
      <div className="px-4 py-3 text-[12.5px] text-fg-dim leading-relaxed border-b border-line">
        {rawDeltaCents === 0 ? (
          'Nets were rounded to whole dollars for settlement. Per-player changes are shown below.'
        ) : (
          <>
            The raw ledger had <span className="num text-fg">{rawDeltaLabel}</span>.{' '}
            {balancing
              ? `The discrepancy was ${ledgerBalancingLabel(balancing, rawDeltaCents, players)} before settlement rounding. Net changes are shown below.`
              : 'The balancing method was not recorded.'}
          </>
        )}
      </div>
      <div className="divide-y divide-line">
        {adjustments.map((adjustment) => (
          <div
            key={adjustment.playerId}
            className="px-4 py-2.5 flex items-center justify-between gap-3"
          >
            <span className="text-[13px] font-semibold">
              {nameById.get(adjustment.playerId) ?? adjustment.playerId}
            </span>
            <span className="num text-[13px] text-fg">
              {formatDollars(adjustment.amountCents, { signed: true })}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
