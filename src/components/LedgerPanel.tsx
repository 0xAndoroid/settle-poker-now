import { ledgerBalances } from '@/lib/csv';
import { formatNet } from '@/lib/money';
import type { EffectiveBalance, LedgerRow, LedgerUnit } from '@/lib/types';
import { cn } from '@/lib/cn';

interface LedgerPanelProps {
  rows: LedgerRow[];
  effectiveBalances: EffectiveBalance[];
  /** Active unit the values are interpreted in. */
  unit: LedgerUnit;
  /** True when `unit` came from the parser heuristic (no auth signal). */
  unitWasInferred: boolean;
  /** True when the user has manually overridden the unit (else: auto). */
  hasUserOverride: boolean;
  /** Set to a unit to override, or `null` to clear the override and revert to auto. */
  onUnitChange?: (unit: LedgerUnit | null) => void;
  highlightedPlayerId?: string | null;
  onHighlight?: (playerId: string | null) => void;
}

export function LedgerPanel({
  rows,
  effectiveBalances,
  unit,
  unitWasInferred,
  hasUserOverride,
  onUnitChange,
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

      {onUnitChange && (
        <UnitSwitch
          unit={unit}
          unitWasInferred={unitWasInferred}
          hasUserOverride={hasUserOverride}
          onUnitChange={onUnitChange}
        />
      )}

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

interface UnitSwitchProps {
  unit: LedgerUnit;
  unitWasInferred: boolean;
  hasUserOverride: boolean;
  onUnitChange: (unit: LedgerUnit | null) => void;
}

/**
 * Two-position typewriter switch for unit override. Sits just under the
 * Balance Sheet heading. The active option is a filled black chip, the
 * other is outlined. Below the chips, a one-liner reports provenance and
 * exposes a "revert to auto" link if the user overrode the unit.
 */
function UnitSwitch({
  unit,
  unitWasInferred,
  hasUserOverride,
  onUnitChange,
}: UnitSwitchProps) {
  const provenance = hasUserOverride
    ? 'manual override'
    : unitWasInferred
      ? 'auto-detected from ledger magnitudes'
      : 'reported by pokernow';

  return (
    <div className="px-4 py-3 border-b border-hairline bg-paper-2 flex flex-wrap items-center gap-3">
      <span className="text-[10px] uppercase tracking-masthead font-bold text-mute">
        unit
      </span>
      <div role="radiogroup" aria-label="Ledger value unit" className="flex">
        <UnitButton
          label="dollars"
          active={unit === 'dollars'}
          onClick={() => onUnitChange('dollars')}
        />
        <UnitButton
          label="cents"
          active={unit === 'cents'}
          onClick={() => onUnitChange('cents')}
        />
      </div>
      <span className="text-[11px] italic text-mute leading-tight">
        ↳ {provenance}
      </span>
      {hasUserOverride && (
        <button
          type="button"
          onClick={() => onUnitChange(null)}
          className="text-[11px] uppercase tracking-all font-bold underline underline-offset-4 decoration-2 hover:bg-ink hover:text-paper hover:no-underline px-1"
          aria-label="Revert unit override and use auto-detection"
        >
          revert
        </button>
      )}
    </div>
  );
}

interface UnitButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function UnitButton({ label, active, onClick }: UnitButtonProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        'min-h-[36px] px-3 font-mono text-[11px] uppercase tracking-all font-bold border-2 border-ink',
        '-ml-[2px] first:ml-0 first:border-r-[1px] last:border-l-[1px]',
        active
          ? 'bg-ink text-paper'
          : 'bg-paper text-ink hover:bg-paper-3'
      )}
    >
      {label}
    </button>
  );
}
