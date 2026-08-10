import { useMemo, useState } from 'react';
import { LedgerPanel } from './LedgerPanel';
import { SettlementPanel } from './SettlementPanel';
import type { ConfirmFn } from '@/hooks/useConfirmDialog';
import { validateLiveFinalization } from '@/lib/liveProjection';
import { formatDollars } from '@/lib/money';
import { computePlan } from '@/lib/settle';
import { cn } from '@/lib/cn';
import type { IsolationRule, LiveFinalizationCheck, LiveGameSnapshot } from '@/lib/types';

interface LiveFinalizePanelProps {
  snapshot: LiveGameSnapshot;
  pendingCount: number;
  finalizing: boolean;
  isolations: IsolationRule[];
  confirm: ConfirmFn;
  onFinalize: (
    force: boolean,
    isolations: IsolationRule[],
    roundToDollars: boolean
  ) => Promise<void>;
}

export function LiveFinalizePanel({
  snapshot,
  pendingCount,
  finalizing,
  isolations,
  confirm,
  onFinalize,
}: LiveFinalizePanelProps) {
  const [force, setForce] = useState(false);
  const [roundToDollars, setRoundToDollars] = useState(true);
  const validation = useMemo(
    () => validateLiveFinalization(snapshot, { pendingCount, force, roundToDollars }),
    [force, pendingCount, roundToDollars, snapshot]
  );
  const preview = useMemo(() => {
    const rows = validation.rows;
    const rawRows = validation.rawRows;
    const adjustments = validation.adjustments;
    const validIds = new Set(rows.map((row) => row.playerId));
    const validIsolations = isolations.filter(
      (rule) =>
        validIds.has(rule.playerId) &&
        validIds.has(rule.counterpartId) &&
        rule.playerId !== rule.counterpartId
    );
    const { balances, plan } = computePlan(rows, adjustments, validIsolations);
    const rawNetByPlayer = new Map(rawRows.map((row) => [row.playerId, row.netCents]));
    const displayBalances = balances.map((balance) => ({
      ...balance,
      originalNetCents: rawNetByPlayer.get(balance.playerId) ?? balance.originalNetCents,
    }));
    return { rows, balances: displayBalances, isolations: validIsolations, plan };
  }, [isolations, validation]);

  const chipCheck = validation.checks.find((check) => check.key === 'chip_bank');
  const canForceChip = chipCheck && !chipCheck.ok;
  const hasIsolationCycle = preview.plan.cyclePlayerIds.length > 0;
  const blockedCount = validation.checks.filter((check) => check.blocking && !check.ok).length;
  const canFinalize = !finalizing && validation.ok && !hasIsolationCycle;
  const imbalanceMessage = formatImbalanceConfirmation(
    validation.rawRows.reduce((acc, row) => acc + row.netCents, 0)
  );

  const handleFinalize = async () => {
    if (imbalanceMessage) {
      const confirmed = await confirm({
        title: 'Finalize with imbalance?',
        confirmLabel: 'continue',
        body: (
          <div className="space-y-3">
            <p>{imbalanceMessage}</p>
            <p>The final ledger will include the proportional adjustment shown in the preview.</p>
          </div>
        ),
      });
      if (!confirmed) return;
    }
    void onFinalize(force, preview.isolations, roundToDollars);
  };

  return (
    <section className="space-y-5" aria-label="Finalize live game">
      <div className="card kc-yellow">
        <div className="card-header">
          <span className="ticker-label-strong">finalize</span>
          {!canFinalize && !finalizing && (
            <span className="pill pill-warn">
              {hasIsolationCycle
                ? 'cycle'
                : `${blockedCount} check${blockedCount === 1 ? '' : 's'} to fix`}
            </span>
          )}
        </div>
        <div className="px-4 pt-4 pb-3 border-b border-line">
          <button
            type="button"
            onClick={() => void handleFinalize()}
            disabled={!canFinalize}
            className="btn btn-fill w-full h-12 text-[14px] tracking-[0.02em]"
            aria-label="Finalize the game and mint the shareable settlement"
          >
            {finalizing ? 'finalizing…' : 'finalize game ›'}
          </button>
          <p className="mt-2 text-[11.5px] text-fg-mute leading-snug text-center">
            {canFinalize
              ? 'locks the ledger and mints the shareable payment list'
              : 'clears once every check below passes'}
          </p>
        </div>
        <div className="divide-y divide-line">
          {validation.checks.map((check) => (
            <div key={check.key} className="px-4 py-3 flex items-start gap-3">
              <span className={cn('pill', checkPillClass(check))}>{checkPillLabel(check)}</span>
              <div>
                <p className="text-[13px] font-semibold">{check.label}</p>
                {check.detail && <p className="text-[12px] text-fg-dim mt-1">{check.detail}</p>}
              </div>
            </div>
          ))}
        </div>
        {canForceChip && (
          <label className="border-t border-line bg-warn/5 px-4 py-3 flex items-center gap-2 text-[13px] text-fg-dim">
            <input
              type="checkbox"
              checked={force}
              onChange={(event) => setForce(event.target.checked)}
              className="checkbox-poker"
            />
            finalize with the latest chip discrepancy
          </label>
        )}
      </div>

      {preview.rows.length > 0 && (
        <>
          <LedgerPanel
            rows={preview.rows}
            effectiveBalances={preview.balances}
            unit="cents"
            unitWasInferred={false}
            hasUserOverride={false}
          />
          <SettlementPanel
            plan={preview.plan}
            balances={preview.balances}
            rounding={{ enabled: roundToDollars, onChange: setRoundToDollars }}
          />
        </>
      )}
    </section>
  );
}

function checkPillClass(check: LiveFinalizationCheck): string {
  if (!check.ok) return 'pill-loss';
  return check.warn ? 'pill-warn' : 'pill-gain';
}

function checkPillLabel(check: LiveFinalizationCheck): string {
  if (!check.ok) return 'fix';
  return check.warn ? 'warn' : 'ok';
}

function formatImbalanceConfirmation(rawDeltaCents: number): string | null {
  if (Math.abs(rawDeltaCents) <= 1) return null;
  const amount = formatDollars(Math.abs(rawDeltaCents));
  if (rawDeltaCents < 0) {
    return `There's ${amount} missing. It will be split proportionally among winners, reducing their winnings.`;
  }
  return `There's ${amount} surplus. It will be distributed proportionally among losers, reducing their losses.`;
}
