import { formatDollars } from '@/lib/money';
import type {
  EffectiveBalance,
  PersistedPaymentMethod,
  SettlementPlan,
} from '@/lib/types';
import { orderPaymentsBySenderTotal } from '@/lib/paymentOrdering';
import { SettlementRow } from './SettlementRow';

export interface PaymentCompletion {
  completedAt: number | null;
  completedBy: string | null;
}

interface SettlementPanelProps {
  plan: SettlementPlan;
  balances: EffectiveBalance[];
  /**
   * Server-side payment ids, parallel to `plan.txns`. Required when
   * completion checkboxes should appear.
   */
  paymentIds?: ReadonlyArray<string>;
  /**
   * Map paymentId → completion state. Drives the strikethrough +
   * "settled by ___" caption.
   */
  completionByPaymentId?: ReadonlyMap<string, PaymentCompletion>;
  onTogglePayment?: (paymentId: string, next: boolean) => void | Promise<void>;
  /** Persistent flow: copy the canonical /g/<id> link to clipboard. */
  onCopyLink?: () => void | Promise<void>;
  /** Persistent flow: trigger native Web Share API (mobile) or fall back to copy. */
  onShare?: () => void | Promise<void>;
  /** Ephemeral flow: mint a finalized persistent game from the current state. */
  onFinalize?: () => void | Promise<void>;
  /** Ephemeral flow: spinner state on the finalize button. */
  finalizing?: boolean;
  /** Persistent flow: per-player Venmo / Zelle handles. Drives row icons. */
  paymentMethodsByPlayerId?: ReadonlyMap<string, PersistedPaymentMethod>;
  /**
   * Per-game note threaded into the Venmo `note=` query param. Empty /
   * null falls back to the default payment note.
   */
  gameNote?: string | null;
  /** Persistent flow: selected local player's canonical id. */
  currentPlayerId?: string | null;
  /** Toast hook so row icon clicks can surface confirmations. */
  pushToast?: (message: string, variant?: 'success' | 'error' | 'info') => void;
  onHighlight?: (playerId: string | null) => void;
}

export function SettlementPanel({
  plan,
  balances,
  paymentIds,
  completionByPaymentId,
  onTogglePayment,
  onCopyLink,
  onShare,
  onFinalize,
  finalizing = false,
  paymentMethodsByPlayerId,
  gameNote,
  currentPlayerId,
  pushToast,
  onHighlight,
}: SettlementPanelProps) {
  const nameById = new Map(balances.map((b) => [b.playerId, b.nickname]));
  const orderedPayments = orderPaymentsBySenderTotal(plan.txns);

  const hasCycle = plan.cyclePlayerIds.length > 0;
  const cycleNames = plan.cyclePlayerIds.map(
    (id) => nameById.get(id) ?? id
  );
  const preferenceStatus = plan.paymentPreferenceStatus;
  const preferenceSplitApplied = preferenceStatus.applied;
  const preferenceSplitFailed = preferenceStatus.reason === 'unbalanced';

  // Derived completion stats — only meaningful in persistent mode.
  const persistent = !!paymentIds && !!completionByPaymentId;
  let settledCount = 0;
  let outstandingCount = plan.txns.length;
  if (persistent) {
    settledCount = (paymentIds ?? []).reduce((acc, id) => {
      const c = completionByPaymentId!.get(id);
      return acc + (c && c.completedAt !== null ? 1 : 0);
    }, 0);
    outstandingCount = plan.txns.length - settledCount;
  }

  const totalMoved = plan.txns.reduce((acc, t) => acc + t.amountCents, 0);
  const outstandingMoved = persistent
    ? plan.txns.reduce((acc, t, i) => {
        const id = paymentIds![i];
        const c = id ? completionByPaymentId!.get(id) : undefined;
        return acc + (c && c.completedAt !== null ? 0 : t.amountCents);
      }, 0)
    : totalMoved;

  return (
    <section aria-labelledby="settlement-heading" className="card">
      <div className="card-header">
        <span id="settlement-heading" className="ticker-label-strong">
          payments
          <span className="text-fg-mute font-normal ml-2">
            {plan.txns.length === 0
              ? '· none'
              : persistent
                ? `· ${settledCount}/${plan.txns.length} settled`
                : `· ${plan.txns.length} txn${plan.txns.length === 1 ? '' : 's'}`}
          </span>
        </span>
        <div className="flex items-center gap-1.5">
          {preferenceSplitApplied && (
            <span className="pill pill-accent">rail safe</span>
          )}
          {onFinalize && (
            <button
              type="button"
              onClick={onFinalize}
              disabled={finalizing || plan.txns.length === 0 || hasCycle}
              className="btn btn-fill btn-sm"
              aria-label="Finalize the plan and mint a shareable link"
            >
              {finalizing ? 'finalizing…' : 'finalize ›'}
            </button>
          )}
          {onCopyLink && (
            <button
              type="button"
              onClick={onCopyLink}
              className="btn btn-ghost btn-sm"
              aria-label="Copy this game's URL to clipboard"
            >
              copy link
            </button>
          )}
          {onShare && (
            <button
              type="button"
              onClick={onShare}
              className="btn btn-fill btn-sm"
              aria-label="Share this game's URL"
            >
              share ›
            </button>
          )}
        </div>
      </div>

      {hasCycle && (
        <div className="px-4 py-3 border-b border-line bg-loss/5">
          <div className="flex items-center gap-2 mb-1">
            <span className="pill pill-loss">cycle</span>
            <span className="ticker-label-strong text-loss">
              isolation cycle detected
            </span>
          </div>
          <p className="text-[12.5px] text-fg-dim leading-relaxed">
            <span className="text-fg font-semibold">{cycleNames.join(' → ')}</span>
            {' '}form a cycle of isolation rules. Break the cycle in
            “private rules” to settle these players.
          </p>
        </div>
      )}

      {preferenceSplitFailed && (
        <div className="px-4 py-3 border-b border-line bg-warn/5">
          <div className="flex items-center gap-2 mb-1">
            <span className="pill">prefs</span>
            <span className="ticker-label-strong text-warn">
              rail-safe routing needs a proxy
            </span>
          </div>
          <p className="text-[12.5px] text-fg-dim leading-relaxed">
            Venmo-only and Zelle-only players need someone who can use both
            rails to bridge this ledger. The normal settlement is shown.
          </p>
        </div>
      )}

      {plan.txns.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <p className="ticker-label-strong text-fg">
            {hasCycle ? '— pending —' : 'already settled.'}
          </p>
          {!hasCycle && (
            <p className="text-[12px] text-fg-mute mt-1.5">
              No payments necessary. Everybody&apos;s even.
            </p>
          )}
        </div>
      ) : (
        <ol>
          {orderedPayments.map(({ payment: t, originalIndex }, i) => {
            const paymentId = paymentIds?.[originalIndex];
            const completion = paymentId
              ? completionByPaymentId?.get(paymentId)
              : undefined;
            const recipientMethod =
              paymentMethodsByPlayerId?.get(t.toId) ?? null;
            const highlightsCurrentPlayer =
              currentPlayerId !== null &&
              currentPlayerId !== undefined &&
              (t.fromId === currentPlayerId || t.toId === currentPlayerId);
            return (
              <SettlementRow
                key={paymentId ?? `${t.fromId}-${t.toId}-${i}`}
                index={i + 1}
                fromName={nameById.get(t.fromId) ?? t.fromId}
                toName={nameById.get(t.toId) ?? t.toId}
                amountCents={t.amountCents}
                forced={t.forced}
                paymentId={paymentId}
                completedAt={completion?.completedAt ?? null}
                completedBy={completion?.completedBy ?? null}
                onTogglePayment={onTogglePayment}
                recipientMethod={recipientMethod}
                gameNote={gameNote ?? null}
                highlightsCurrentPlayer={highlightsCurrentPlayer}
                pushToast={pushToast}
                onHover={(hover) => onHighlight?.(hover ? t.fromId : null)}
              />
            );
          })}
        </ol>
      )}

      {plan.txns.length > 0 && (
        <div className="border-t border-line-strong bg-surface-2 px-4 py-2.5 flex items-baseline justify-between gap-3">
          <span className="ticker-label-strong">
            {persistent ? `outstanding · ${outstandingCount}` : 'total'}
          </span>
          <span className="font-mono num font-bold text-[15px] text-fg">
            {persistent
              ? `${formatDollars(outstandingMoved)} / ${formatDollars(totalMoved)}`
              : formatDollars(totalMoved)}
          </span>
        </div>
      )}
    </section>
  );
}
