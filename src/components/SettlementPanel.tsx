import { formatDollars } from '@/lib/money';
import type {
  EffectiveBalance,
  PersistedPaymentMethod,
  SettlementPlan,
} from '@/lib/types';
import { orderPaymentsBySenderTotal } from '@/lib/paymentOrdering';
import { Amount } from './Amount';
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
  /** Persistent flow: selected local player's display name. */
  identityNickname?: string | null;
  /**
   * Persistent flow: opens the "get paid" modal (pick your name + register
   * Venmo / Zelle). Presence enables the identity strip under the header.
   */
  onEditPaymentDetails?: () => void;
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
  identityNickname,
  onEditPaymentDetails,
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

  // One-line "what do I owe" readout for the identified player. Counts
  // only OUTSTANDING payments so it ticks down as boxes get checked.
  let identitySummary: string | null = null;
  if (persistent && currentPlayerId && identityNickname) {
    let payCents = 0;
    let payCount = 0;
    let collectCents = 0;
    let collectCount = 0;
    let involved = false;
    plan.txns.forEach((t, i) => {
      const isSender = t.fromId === currentPlayerId;
      const isRecipient = t.toId === currentPlayerId;
      if (!isSender && !isRecipient) return;
      involved = true;
      const id = paymentIds![i];
      const c = id ? completionByPaymentId!.get(id) : undefined;
      if (c && c.completedAt !== null) return;
      if (isSender) {
        payCents += t.amountCents;
        payCount += 1;
      } else {
        collectCents += t.amountCents;
        collectCount += 1;
      }
    });
    const parts: string[] = [];
    if (payCount > 0) {
      parts.push(
        `you pay ${formatDollars(payCents)}${payCount > 1 ? ` in ${payCount} payments` : ''}`
      );
    }
    if (collectCount > 0) {
      parts.push(
        `${payCount > 0 ? 'collect' : 'you collect'} ${formatDollars(collectCents)}${
          collectCount > 1 ? ` in ${collectCount} payments` : ''
        }`
      );
    }
    identitySummary =
      parts.length > 0 ? parts.join(' · ') : involved ? "you're all settled" : "you're even";
  }

  return (
    <section aria-labelledby="settlement-heading" className="card kc-yellow">
      <div className="card-header">
        <span id="settlement-heading" className="ticker-label-strong min-w-0">
          payments
          <span className="text-fg-mute font-normal ml-2 tabular-nums">
            {plan.txns.length === 0
              ? '· none'
              : persistent
                ? `· ${settledCount}/${plan.txns.length} settled`
                : `· ${plan.txns.length} txn${plan.txns.length === 1 ? '' : 's'}`}
          </span>
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {preferenceSplitApplied && (
            <span className="pill pill-accent">rail safe</span>
          )}
          {onFinalize && (
            <button
              type="button"
              onClick={onFinalize}
              disabled={finalizing || plan.txns.length === 0 || hasCycle}
              className="btn btn-fill btn-sm min-h-[44px] sm:min-h-0"
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
              className="btn btn-fill btn-sm min-h-[44px] sm:min-h-0"
              aria-label="Share this game's URL"
            >
              share ›
            </button>
          )}
        </div>
      </div>

      {onEditPaymentDetails && !identityNickname && (
        <button
          type="button"
          onClick={onEditPaymentDetails}
          className="w-full min-h-[48px] px-4 py-2.5 flex items-center justify-between gap-3 border-b border-line bg-accent/[0.06] text-left group"
        >
          <span className="text-[13px] text-fg-dim leading-snug">
            <span className="font-semibold text-fg">Who are you?</span> Pick your name, add Venmo
            / Zelle.
          </span>
          <span className="ticker-label-strong text-accent shrink-0 group-hover:underline underline-offset-4">
            get paid ›
          </span>
        </button>
      )}

      {onEditPaymentDetails && identityNickname && (
        <div className="pl-4 pr-2 py-1.5 flex items-center justify-between gap-3 border-b border-line bg-fill-1">
          <span className="text-[12.5px] text-fg-dim min-w-0 truncate">
            you are <span className="font-semibold text-fg">{identityNickname}</span>
            {identitySummary && (
              <>
                {' · '}
                <span className="text-fg tabular-nums">{identitySummary}</span>
              </>
            )}
          </span>
          <button
            type="button"
            onClick={onEditPaymentDetails}
            className="btn btn-ghost btn-sm shrink-0"
            aria-label="Edit who you are and your Venmo / Zelle handles"
          >
            edit
          </button>
        </div>
      )}

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
          <p className="font-serif italic text-[21px] font-[480] text-fg tracking-[-0.01em]">
            {hasCycle ? '— pending —' : 'Already settled.'}
          </p>
          {!hasCycle && (
            <p className="text-[12px] text-fg-mute mt-2">
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
        <div className="border-t border-line bg-fill-1 px-4 py-2.5 flex items-baseline justify-between gap-3">
          <span className="ticker-label-strong tabular-nums">
            {persistent ? `outstanding · ${outstandingCount}` : 'total'}
          </span>
          {persistent ? (
            <span className="num font-bold text-[15px] text-fg">
              <Amount cents={outstandingMoved} />
              <span className="mx-1.5 font-normal text-fg-mute">/</span>
              <Amount cents={totalMoved} className="text-fg-dim" />
            </span>
          ) : (
            <Amount cents={totalMoved} className="font-bold text-[16px] text-fg" />
          )}
        </div>
      )}
    </section>
  );
}
