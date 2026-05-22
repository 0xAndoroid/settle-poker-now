import { formatDollars } from '@/lib/money';
import type { PersistedLedgerAdjustment } from '@/lib/persistedProjection';
import type { PersistedGameSnapshot } from '@/lib/types';

interface LedgerAdjustmentNoticeProps {
  adjustments: PersistedLedgerAdjustment[];
  players: PersistedGameSnapshot['players'];
}

export function LedgerAdjustmentNotice({ adjustments, players }: LedgerAdjustmentNoticeProps) {
  const nameById = new Map(players.map((player) => [player.playerId, player.nickname]));
  const rawDeltaCents = -adjustments.reduce((acc, adjustment) => acc + adjustment.amountCents, 0);
  const rawDeltaLabel =
    rawDeltaCents < 0
      ? `${formatDollars(Math.abs(rawDeltaCents))} missing`
      : `${formatDollars(rawDeltaCents)} surplus`;

  return (
    <section className="card" aria-label="Ledger adjustment">
      <div className="card-header">
        <span className="ticker-label-strong">ledger adjustment</span>
        <span className="pill pill-accent">live</span>
      </div>
      <div className="px-4 py-3 text-[12.5px] text-fg-dim leading-relaxed border-b border-line">
        Raw cashouts had <span className="font-mono num text-fg">{rawDeltaLabel}</span>. Final
        settlement nets were balanced proportionally before payments were generated.
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
            <span className="font-mono num text-[13px] text-fg">
              {formatDollars(adjustment.amountCents, { signed: true })}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
