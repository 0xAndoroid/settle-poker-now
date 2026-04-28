import { formatDollars } from '@/lib/money';
import type {
  EffectiveBalance,
  PersistedPaymentMethod,
  SettlementPlan,
} from '@/lib/types';
import { copyText } from '@/lib/clipboard';
import { cn } from '@/lib/cn';
import { composeVenmoPayUrl, formatZelleHandle } from '@/lib/paymentLinks';

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
  pushToast,
  onHighlight,
}: SettlementPanelProps) {
  const nameById = new Map(balances.map((b) => [b.playerId, b.nickname]));

  const hasCycle = plan.cyclePlayerIds.length > 0;
  const cycleNames = plan.cyclePlayerIds.map(
    (id) => nameById.get(id) ?? id
  );

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
          {plan.txns.map((t, i) => {
            const paymentId = paymentIds?.[i];
            const completion = paymentId
              ? completionByPaymentId?.get(paymentId)
              : undefined;
            const recipientMethod =
              paymentMethodsByPlayerId?.get(t.toId) ?? null;
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

interface SettlementRowProps {
  index: number;
  fromName: string;
  toName: string;
  amountCents: number;
  forced?: boolean;
  paymentId?: string;
  completedAt: number | null;
  completedBy: string | null;
  onTogglePayment?: (paymentId: string, next: boolean) => void | Promise<void>;
  recipientMethod: PersistedPaymentMethod | null;
  pushToast?: (message: string, variant?: 'success' | 'error' | 'info') => void;
  onHover?: (hovering: boolean) => void;
}

function SettlementRow({
  index,
  fromName,
  toName,
  amountCents,
  forced,
  paymentId,
  completedAt,
  completedBy,
  onTogglePayment,
  recipientMethod,
  pushToast,
  onHover,
}: SettlementRowProps) {
  const isCompleted = completedAt !== null;
  const persistent = paymentId !== undefined && onTogglePayment !== undefined;

  const handleToggle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (!persistent) return;
    await onTogglePayment(paymentId, e.target.checked);
  };

  const handleVenmoClick = () => {
    if (!recipientMethod?.venmoUsername) return;
    try {
      const url = composeVenmoPayUrl({
        recipientUsername: recipientMethod.venmoUsername,
        amountCents,
      });
      // Anchor element click is more reliable than `window.location.href = url`
      // for custom-scheme URLs on iOS Safari.
      const a = document.createElement('a');
      a.href = url;
      a.rel = 'noopener noreferrer';
      a.click();
      pushToast?.(
        `opening venmo to pay @${recipientMethod.venmoUsername} ${formatDollars(amountCents)}`,
        'info'
      );
    } catch (err) {
      pushToast?.((err as Error).message, 'error');
    }
  };

  const handleZelleClick = async () => {
    if (!recipientMethod?.zelleHandle) return;
    const display = formatZelleHandle(recipientMethod.zelleHandle);
    const ok = await copyText(display);
    pushToast?.(
      ok ? `zelle handle copied — paste in your bank app: ${display}` : 'could not copy zelle handle',
      ok ? 'success' : 'error'
    );
  };

  return (
    <li
      className={cn(
        'border-b border-line/60 last:border-b-0',
        isCompleted && 'bg-gain/[0.04]'
      )}
    >
      <div
        className={cn(
          'group w-full text-left py-3 px-4 flex items-center gap-3',
          'min-h-[52px]'
        )}
      >
        {persistent ? (
          <label
            className="flex items-center justify-center w-6 flex-shrink-0 cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={isCompleted}
              onChange={handleToggle}
              className="checkbox-poker"
              aria-label={
                isCompleted
                  ? `Mark ${fromName} → ${toName} as outstanding`
                  : `Mark ${fromName} → ${toName} as settled`
              }
            />
          </label>
        ) : (
          <span className="font-mono num text-fg-mute text-[11px] w-6 flex-shrink-0">
            {String(index).padStart(2, '0')}
          </span>
        )}

        <div
          onMouseEnter={() => onHover?.(true)}
          onMouseLeave={() => onHover?.(false)}
          className="flex-1 min-w-0 flex items-center gap-2 sm:gap-3"
        >
          <span
            className={cn(
              'flex-1 min-w-0 flex items-center gap-2 sm:gap-3 font-sans text-[14px]',
              isCompleted && 'line-through opacity-60'
            )}
          >
            <span className="font-semibold text-loss truncate flex-shrink min-w-0">
              {fromName}
            </span>
            <span aria-hidden="true" className="text-fg-mute font-mono shrink-0">↦</span>
            <span className="font-semibold text-gain truncate flex-shrink min-w-0">
              {toName}
            </span>
            {forced && (
              <span className="pill pill-accent shrink-0 hidden sm:inline-flex">
                isolated
              </span>
            )}
          </span>
          <span
            className={cn(
              'font-mono num font-bold text-[14px] sm:text-[15px] flex-shrink-0',
              isCompleted ? 'text-fg-dim line-through' : 'text-fg'
            )}
          >
            {formatDollars(amountCents)}
          </span>
          {recipientMethod && !isCompleted && (
            <PaymentMethodIcons
              recipientName={toName}
              method={recipientMethod}
              onVenmoClick={handleVenmoClick}
              onZelleClick={handleZelleClick}
            />
          )}
        </div>
      </div>

      {isCompleted && completedBy && (
        <div className="px-4 pb-2 -mt-1 ticker-label text-fg-mute">
          ↳ settled by {completedBy}
          {completedAt !== null && (
            <>
              {' · '}
              {formatTimeAgo(completedAt)}
            </>
          )}
        </div>
      )}
      {isCompleted && !completedBy && completedAt !== null && (
        <div className="px-4 pb-2 -mt-1 ticker-label text-fg-mute">
          ↳ settled {formatTimeAgo(completedAt)}
        </div>
      )}
    </li>
  );
}

interface PaymentMethodIconsProps {
  recipientName: string;
  method: PersistedPaymentMethod;
  onVenmoClick: () => void;
  onZelleClick: () => void;
}

function PaymentMethodIcons({
  recipientName,
  method,
  onVenmoClick,
  onZelleClick,
}: PaymentMethodIconsProps) {
  const hasVenmo = !!method.venmoUsername;
  const hasZelle = !!method.zelleHandle;
  if (!hasVenmo && !hasZelle) return null;
  return (
    <span className="flex items-center gap-1 shrink-0">
      {hasVenmo && (
        <button
          type="button"
          onClick={onVenmoClick}
          className="payment-icon"
          aria-label={`Open Venmo to pay ${recipientName} (@${method.venmoUsername})`}
          title={`venmo @${method.venmoUsername}`}
        >
          <VenmoMark />
        </button>
      )}
      {hasZelle && (
        <button
          type="button"
          onClick={onZelleClick}
          className="payment-icon"
          aria-label={`Copy ${recipientName}'s Zelle handle to clipboard`}
          title={`zelle: ${method.zelleHandle}`}
        >
          <ZelleMark />
        </button>
      )}
    </span>
  );
}

function VenmoMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M19.6 4.5c.7 1.2 1 2.4 1 3.9 0 4.8-4.1 11-7.4 15.4H5.5L2.4 5.4l6.7-.6 1.7 13.2c1.5-2.5 3.4-6.4 3.4-9.1 0-1.5-.3-2.5-.7-3.3l5.7-.6.4-.5z"
      />
    </svg>
  );
}

function ZelleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2c5.5 0 10 4.5 10 10s-4.5 10-10 10S2 17.5 2 12 6.5 2 12 2zm-2 5v2H7l-.4.6L11 17h-3v2h6v-2l3.4-7.4.6-.6h-3V7h-5z"
      />
    </svg>
  );
}

function formatTimeAgo(ms: number): string {
  const delta = Date.now() - ms;
  if (delta < 60_000) return 'just now';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
