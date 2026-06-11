import { Amount } from './Amount';
import { ledgerBalances } from '@/lib/csv';
import { formatNet } from '@/lib/money';
import type { EffectiveBalance, LedgerRow, LedgerUnit } from '@/lib/types';
import { cn } from '@/lib/cn';

interface LedgerPanelProps {
  rows: LedgerRow[];
  effectiveBalances: EffectiveBalance[];
  unit: LedgerUnit;
  unitWasInferred: boolean;
  hasUserOverride: boolean;
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
    <section aria-labelledby="ledger-heading" className="card">
      <div className="card-header">
        <span id="ledger-heading" className="ticker-label-strong">
          ledger
          <span className="text-fg-mute font-normal ml-2">
            · {rows.length} player{rows.length === 1 ? '' : 's'}
            {hasAdjustments && ' · adj'}
          </span>
        </span>
        {!ledgerCheck.isBalanced && (
          <span role="alert" className="pill pill-loss" title={`Off by ${formatNet(ledgerCheck.sumCents)}`}>
            off · {formatNet(ledgerCheck.sumCents)}
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

      <table className="w-full num text-[13px]">
        <colgroup>
          <col className="w-[40px]" />
          <col />
          <col className="w-[120px]" />
        </colgroup>
        <thead>
          <tr className="border-b border-line bg-fill-1">
            <th className="text-left ticker-label py-2 pl-4 pr-1 font-sans">#</th>
            <th className="text-left ticker-label py-2 px-2 font-sans">player</th>
            <th className="text-right ticker-label py-2 pr-4 pl-2 font-sans">net</th>
          </tr>
        </thead>
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
                    'border-b border-line last:border-b-0 transition-colors',
                    isHighlighted && 'bg-fill-1'
                  )}
                >
                  <td className="pl-4 pr-1 py-3 text-fg-mute text-[11px] num align-top">
                    {String(idx + 1).padStart(2, '0')}
                  </td>
                  <td className="py-3 px-2 align-top">
                    <div className="font-sans font-semibold text-[14px] text-fg leading-tight">
                      {b.nickname}
                    </div>
                    {adjusted && original && (
                      <div className="ticker-label mt-1 text-fg-mute">
                        adj · was {formatNet(original.originalNetCents)}
                      </div>
                    )}
                  </td>
                  <td
                    className={cn(
                      'pr-4 pl-2 py-3 text-right align-top',
                      isWin && 'text-gain',
                      isLoss && 'text-loss',
                      !isWin && !isLoss && 'text-fg-mute'
                    )}
                  >
                    <Amount
                      cents={b.effectiveNetCents}
                      signed
                      className="font-sans font-semibold text-[14px] leading-tight"
                    />
                  </td>
                </tr>
              );
            })}
        </tbody>
        <tfoot>
          <tr className="border-t border-line bg-fill-1">
            <td colSpan={2} className="py-2.5 pl-4 pr-2 ticker-label-strong">
              total
            </td>
            <td
              className={cn(
                'pr-4 pl-2 py-2.5 text-right',
                ledgerCheck.isBalanced ? 'text-fg' : 'text-loss'
              )}
            >
              <Amount
                cents={ledgerCheck.sumCents}
                signed
                className="font-sans font-bold text-[14px]"
              />
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

function UnitSwitch({
  unit,
  unitWasInferred,
  hasUserOverride,
  onUnitChange,
}: UnitSwitchProps) {
  const provenance = hasUserOverride
    ? 'manual override'
    : unitWasInferred
      ? 'auto-detected'
      : 'reported by pokernow';

  return (
    <div className="px-4 py-2.5 border-b border-line bg-fill-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="ticker-label">unit</span>
      <div
        role="radiogroup"
        aria-label="Ledger value unit"
        className="flex rounded-full border border-line bg-fill-1 p-0.5"
      >
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
      <span className="ticker-label">↳ {provenance}</span>
      {hasUserOverride && (
        <button
          type="button"
          onClick={() => onUnitChange(null)}
          className="text-[10px] uppercase tracking-ticker font-bold text-accent hover:underline underline-offset-4"
          aria-label="Revert unit override"
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
        'min-h-[26px] px-3 font-sans text-[10px] uppercase tracking-ticker font-bold rounded-full',
        'transition-colors duration-200',
        active ? 'bg-accent text-[#0c1018]' : 'text-fg-dim hover:text-fg'
      )}
    >
      {label}
    </button>
  );
}
