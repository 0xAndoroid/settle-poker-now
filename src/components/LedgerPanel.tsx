import { ledgerBalances } from '@/lib/csv';
import { formatNet } from '@/lib/money';
import type { EffectiveBalance, LedgerRow } from '@/lib/types';
import { cn } from '@/lib/cn';

interface LedgerPanelProps {
  rows: LedgerRow[];
  effectiveBalances: EffectiveBalance[];
  highlightedPlayerId?: string | null;
  onHighlight?: (playerId: string | null) => void;
}

export function LedgerPanel({
  rows,
  effectiveBalances,
  highlightedPlayerId,
  onHighlight,
}: LedgerPanelProps) {
  const balanceById = new Map(effectiveBalances.map((b) => [b.playerId, b]));
  const ledgerCheck = ledgerBalances(rows);
  const hasAdjustments = effectiveBalances.some(
    (b) => b.effectiveNetCents !== b.originalNetCents
  );

  return (
    <section aria-labelledby="ledger-heading" className="slab">
      <div className="slab-heading">
        <span id="ledger-heading">
          balance sheet
          <span className="ml-3 text-mute">— {rows.length}{rows.length === 1 ? ' player' : ' players'}</span>
          {hasAdjustments && <span className="ml-2 text-mute">(adj.)</span>}
        </span>
        {!ledgerCheck.isBalanced && (
          <span
            role="alert"
            className="cell border-loss text-loss"
            title={`Ledger off by ${formatNet(ledgerCheck.sumCents)}`}
          >
            ⚠ off by {formatNet(ledgerCheck.sumCents)}
          </span>
        )}
      </div>

      <table className="w-full font-mono text-[13px]">
        <colgroup>
          <col className="w-[12px]" />
          <col />
          <col className="w-[120px]" />
        </colgroup>
        <tbody>
          {effectiveBalances
            .slice()
            .sort(
              (a, b) =>
                b.effectiveNetCents - a.effectiveNetCents ||
                a.playerId.localeCompare(b.playerId)
            )
            .map((b, idx) => {
              const original = balanceById.get(b.playerId);
              const adjusted =
                original && original.originalNetCents !== b.effectiveNetCents;
              const isWin = b.effectiveNetCents > 0;
              const isLoss = b.effectiveNetCents < 0;
              const isHighlighted = highlightedPlayerId === b.playerId;

              return (
                <tr
                  key={b.playerId}
                  onMouseEnter={() => onHighlight?.(b.playerId)}
                  onMouseLeave={() => onHighlight?.(null)}
                  className={cn(
                    'border-t border-hairline',
                    idx === 0 && 'border-t-0',
                    isHighlighted && 'bg-paper-2'
                  )}
                >
                  <td className="pl-4 pr-1 py-3 text-mute text-[11px] tabular-nums align-top">
                    {String(idx + 1).padStart(2, '0')}
                  </td>
                  <td className="py-3 align-top">
                    <div className="font-bold leading-tight">{b.nickname}</div>
                    {adjusted && original && (
                      <div className="text-[10.5px] text-mute mt-0.5 uppercase tracking-all">
                        adj. from {formatNet(original.originalNetCents)}
                      </div>
                    )}
                  </td>
                  <td
                    className={cn(
                      'pr-4 py-3 text-right font-bold tabular-nums leading-tight align-top',
                      isLoss && 'text-loss',
                      !isWin && !isLoss && 'text-mute'
                    )}
                  >
                    {formatNet(b.effectiveNetCents)}
                  </td>
                </tr>
              );
            })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-ink">
            <td colSpan={2} className="px-4 py-2 text-[10px] uppercase tracking-masthead font-bold">
              total
            </td>
            <td
              className={cn(
                'pr-4 py-2 text-right font-extrabold tabular-nums text-[13px]',
                ledgerCheck.isBalanced ? 'text-ink' : 'text-loss'
              )}
            >
              {formatNet(ledgerCheck.sumCents)}
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}
