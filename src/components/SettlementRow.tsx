import type { ChangeEvent } from 'react';
import { PaymentMethodIcons } from './PaymentMethodIcons';
import { copyText } from '@/lib/clipboard';
import { cn } from '@/lib/cn';
import { formatDollars } from '@/lib/money';
import {
  composeVenmoPayUrl,
  detectMobilePlatform,
  formatZelleHandle,
} from '@/lib/paymentLinks';
import type { PersistedPaymentMethod } from '@/lib/types';

// UA doesn't change during a session, so resolve it once at module load.
const VENMO_PLATFORM = detectMobilePlatform();

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
  /** Threaded into the Venmo deep-link `note=` query param. */
  gameNote: string | null;
  /** True when the selected local identity is the sender or recipient. */
  highlightsCurrentPlayer: boolean;
  pushToast?: (message: string, variant?: 'success' | 'error' | 'info') => void;
  onHover?: (hovering: boolean) => void;
}

export function SettlementRow({
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
  gameNote,
  highlightsCurrentPlayer,
  pushToast,
  onHover,
}: SettlementRowProps) {
  const isCompleted = completedAt !== null;
  const persistent = paymentId !== undefined && onTogglePayment !== undefined;

  const handleToggle = async (event: ChangeEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (!persistent) return;
    await onTogglePayment(paymentId, event.target.checked);
  };

  const handleVenmoClick = () => {
    if (!recipientMethod?.venmoUsername) return;
    try {
      const url = composeVenmoPayUrl({
        recipientUsername: recipientMethod.venmoUsername,
        amountCents,
        note: gameNote,
        platform: VENMO_PLATFORM,
      });
      if (VENMO_PLATFORM === 'mobile') {
        // Custom-scheme `venmo://...` URLs don't survive `window.open`
        // reliably on iOS Safari; assigning location is the canonical path.
        window.location.href = url;
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
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
        'border-b border-l-2 border-l-transparent border-line/60 last:border-b-0 transition-colors',
        highlightsCurrentPlayer
          ? 'border-l-accent bg-accent/[0.08]'
          : isCompleted && 'bg-gain/[0.04]'
      )}
    >
      <div
        className={cn(
          'group w-full text-left py-3 px-4 flex items-center gap-3',
          'min-h-[52px]'
        )}
      >
        {persistent ? (
          // -mx/-my padding-eating keeps the checkbox visually in the old
          // 24px column while the touch target spans 40px × full row height.
          <label
            className="flex items-center justify-center w-10 -mx-2 -my-3 self-stretch flex-shrink-0 cursor-pointer"
            onClick={(event) => event.stopPropagation()}
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
            <span aria-hidden="true" className="text-fg-mute font-mono shrink-0">
              ↦
            </span>
            <span className="font-semibold text-gain truncate flex-shrink min-w-0">
              {toName}
            </span>
            {forced && (
              <span className="pill pill-accent shrink-0 hidden sm:inline-flex">
                isolated
              </span>
            )}
          </span>
          <PaymentMethodIcons
            recipientName={toName}
            method={recipientMethod}
            visible={!isCompleted}
            onVenmoClick={handleVenmoClick}
            onZelleClick={handleZelleClick}
          />
          <span
            className={cn(
              'font-mono num font-bold text-[14px] sm:text-[15px] flex-shrink-0 text-right',
              isCompleted ? 'text-fg-dim line-through' : 'text-fg'
            )}
          >
            {formatDollars(amountCents)}
          </span>
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
