import { useMemo, useState } from 'react';
import { LedgerPanel } from './LedgerPanel';
import { SettlementPanel } from './SettlementPanel';
import {
  deriveFinalLedgerRows,
  derivePriorPaymentAdjustments,
  validateLiveFinalization,
} from '@/lib/liveProjection';
import { applyAdjustments, buildSettlementPlan } from '@/lib/settle';
import type { EffectiveBalance, LiveGameSnapshot } from '@/lib/types';

interface LiveFinalizePanelProps {
  snapshot: LiveGameSnapshot;
  pendingCount: number;
  finalizing: boolean;
  onFinalize: (force: boolean) => Promise<void>;
}

export function LiveFinalizePanel({
  snapshot,
  pendingCount,
  finalizing,
  onFinalize,
}: LiveFinalizePanelProps) {
  const [force, setForce] = useState(false);
  const validation = useMemo(
    () => validateLiveFinalization(snapshot, { pendingCount, force }),
    [force, pendingCount, snapshot]
  );
  const preview = useMemo(() => {
    const rows = deriveFinalLedgerRows(snapshot);
    const adjustments = derivePriorPaymentAdjustments(snapshot);
    const balances = applyAdjustments(rows, adjustments);
    const plan = buildSettlementPlan(balances, []);
    return { rows, balances, plan };
  }, [snapshot]);

  const chipCheck = validation.checks.find((check) => check.key === 'chip_bank');
  const canForceChip = chipCheck && !chipCheck.ok;

  return (
    <section className="space-y-5" aria-label="Finalize live game">
      <div className="card">
        <div className="card-header">
          <span className="ticker-label-strong">finalize</span>
          <button
            type="button"
            onClick={() => void onFinalize(force)}
            disabled={finalizing || !validation.ok}
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
                {check.detail && (
                  <p className="text-[12px] text-fg-dim mt-1">{check.detail}</p>
                )}
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
            effectiveBalances={toOriginalBalances(preview.balances)}
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

function toOriginalBalances(balances: EffectiveBalance[]): EffectiveBalance[] {
  return balances.map((balance) => ({
    ...balance,
    originalNetCents: balance.effectiveNetCents,
  }));
}
