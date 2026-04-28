import { useState } from 'react';
import { formatDollars } from '@/lib/money';
import type { EffectiveBalance, SettlementPlan } from '@/lib/types';
import { copyText } from '@/lib/clipboard';
import { cn } from '@/lib/cn';

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
  /** Persistent flow: copy the link instead of an image. */
  onCopyLink?: () => void | Promise<void>;
  /** Either flow: render a PNG share. Hidden if undefined. */
  onShareAsImage?: () => void | Promise<void>;
  onHighlight?: (playerId: string | null) => void;
}

export function SettlementPanel({
  plan,
  balances,
  paymentIds,
  completionByPaymentId,
  onTogglePayment,
  onCopyLink,
  onShareAsImage,
  onHighlight,
}: SettlementPanelProps) {
  const nameById = new Map(balances.map((b) => [b.playerId, b.nickname]));

  const txnLine = (fromId: string, toId: string, cents: number) =>
    `${nameById.get(fromId) ?? fromId} → ${nameById.get(toId) ?? toId}: ${formatDollars(cents)}`;

  const allLines = plan.txns
    .map((t) => txnLine(t.fromId, t.toId, t.amountCents))
    .join('\n');

  const [copyAllState, setCopyAllState] = useState<'idle' | 'copied'>('idle');
  const handleCopyAll = async () => {
    if (!allLines) return;
    const ok = await copyText(allLines);
    if (ok) {
      setCopyAllState('copied');
      setTimeout(() => setCopyAllState('idle'), 1500);
    }
  };

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
          <button
            type="button"
            onClick={handleCopyAll}
            disabled={plan.txns.length === 0}
            className="btn btn-ghost btn-sm"
            aria-label="Copy all settlement instructions to clipboard"
          >
            {copyAllState === 'copied' ? '✓ copied' : 'copy all'}
          </button>
          {onCopyLink && (
            <button
              type="button"
              onClick={onCopyLink}
              className="btn btn-fill btn-sm"
              aria-label="Copy a shareable link to this settlement plan"
            >
              copy link ›
            </button>
          )}
          {onShareAsImage && !onCopyLink && (
            <button
              type="button"
              onClick={onShareAsImage}
              disabled={plan.txns.length === 0}
              className="btn btn-fill btn-sm"
              aria-label="Share settlement plan as image"
            >
              share ›
            </button>
          )}
          {onShareAsImage && onCopyLink && (
            <button
              type="button"
              onClick={onShareAsImage}
              disabled={plan.txns.length === 0}
              className="btn btn-ghost btn-sm"
              aria-label="Share settlement plan as image"
            >
              as image
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
                onHover={(hover) => onHighlight?.(hover ? t.fromId : null)}
              />
            );
          })}
        </ol>
      )}

      {plan.txns.length > 0 && (
        <div className="border-t border-line-strong bg-surface-2 px-4 py-2.5 flex items-baseline justify-between gap-3">
          <span className="ticker-label-strong">
            {persistent ? `outstanding · ${outstandingCount}` : 'total moved'}
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
  onHover,
}: SettlementRowProps) {
  const [copied, setCopied] = useState(false);
  const text = `${fromName} → ${toName}: ${formatDollars(amountCents)}`;
  const isCompleted = completedAt !== null;
  const persistent = paymentId !== undefined && onTogglePayment !== undefined;

  const handleCopy = async () => {
    const ok = await copyText(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1300);
    }
  };

  const handleToggle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (!persistent) return;
    await onTogglePayment(paymentId, e.target.checked);
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
                  ? `Mark "${text}" as outstanding`
                  : `Mark "${text}" as settled`
              }
            />
          </label>
        ) : (
          <span className="font-mono num text-fg-mute text-[11px] w-6 flex-shrink-0">
            {String(index).padStart(2, '0')}
          </span>
        )}

        <button
          type="button"
          onClick={handleCopy}
          onMouseEnter={() => onHover?.(true)}
          onMouseLeave={() => onHover?.(false)}
          className={cn(
            'flex-1 min-w-0 flex items-center gap-2 sm:gap-3 text-left',
            'hover:bg-surface-2 active:bg-surface-3 transition-colors duration-100',
            '-my-3 py-3 -mr-2 pr-2 rounded-sm'
          )}
          aria-label={`Copy: ${text}`}
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
          <span
            className={cn(
              'ticker-label w-12 text-right hidden sm:inline',
              'opacity-0 group-hover:opacity-100 transition-opacity',
              copied && 'opacity-100 text-gain'
            )}
            aria-hidden="true"
          >
            {copied ? '✓ copy' : 'copy'}
          </span>
        </button>
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
