import { useMemo, useState } from 'react';
import { IsolationPanel } from './IsolationPanel';
import { LedgerPanel } from './LedgerPanel';
import { SettlementPanel } from './SettlementPanel';
import { validateLiveFinalization } from '@/lib/liveProjection';
import { formatDollars } from '@/lib/money';
import { computePlan } from '@/lib/settle';
import type { IsolationRule, LiveGameSnapshot } from '@/lib/types';

interface LiveFinalizePanelProps {
  snapshot: LiveGameSnapshot;
  pendingCount: number;
  finalizing: boolean;
  isolations: IsolationRule[];
  onIsolationsChange: (rules: IsolationRule[]) => void;
  onFinalize: (force: boolean, isolations: IsolationRule[]) => Promise<void>;
}

export function LiveFinalizePanel({
  snapshot,
  pendingCount,
  finalizing,
  isolations,
  onIsolationsChange,
  onFinalize,
}: LiveFinalizePanelProps) {
  const [force, setForce] = useState(false);
  const validation = useMemo(
    () => validateLiveFinalization(snapshot, { pendingCount, force }),
    [force, pendingCount, snapshot]
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
  const imbalanceMessage = formatImbalanceConfirmation(
    validation.rawRows.reduce((acc, row) => acc + row.netCents, 0)
  );

  const handleFinalize = () => {
    if (
      imbalanceMessage &&
      typeof window !== 'undefined' &&
      !window.confirm(`${imbalanceMessage}\n\nContinue finalizing?`)
    ) {
      return;
    }
    void onFinalize(force, preview.isolations);
  };

  return (
    <section className="space-y-5" aria-label="Finalize live game">
      <div className="card">
        <div className="card-header">
          <span className="ticker-label-strong">finalize</span>
          <button
            type="button"
            onClick={handleFinalize}
            disabled={finalizing || !validation.ok || hasIsolationCycle}
            className="btn btn-fill btn-sm"
          >
            {finalizing ? 'finalizing...' : 'finalize'}
          </button>
        </div>
        <div className="divide-y divide-line">
          {validation.checks.map((check) => (
            <div key={check.key} className="px-4 py-3 flex items-start gap-3">
              <span className={check.ok ? 'pill pill-gain' : 'pill pill-loss'}>
                {check.ok ? 'ok' : 'fix'}
              </span>
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
          {preview.balances.length > 1 && (
            <IsolationPanel
              balances={preview.balances}
              isolations={preview.isolations}
              cyclePlayerIds={preview.plan.cyclePlayerIds}
              onChange={onIsolationsChange}
            />
          )}
          <LedgerPanel
            rows={preview.rows}
            effectiveBalances={preview.balances}
            unit="cents"
            unitWasInferred={false}
            hasUserOverride={false}
          />
          <SettlementPanel plan={preview.plan} balances={preview.balances} />
        </>
      )}
    </section>
  );
}

function formatImbalanceConfirmation(rawDeltaCents: number): string | null {
  if (Math.abs(rawDeltaCents) <= 1) return null;
  const amount = formatDollars(Math.abs(rawDeltaCents));
  if (rawDeltaCents < 0) {
    return `There's ${amount} missing. It will be split proportionally among winners, reducing their winnings.`;
  }
  return `There's ${amount} surplus. It will be distributed proportionally among losers, reducing their losses.`;
}
