import { useState } from 'react';
import { formatDollars } from '@/lib/money';
import type { EffectiveBalance, SettlementPlan } from '@/lib/types';
import { copyText } from '@/lib/clipboard';
import { cn } from '@/lib/cn';

interface SettlementPanelProps {
  plan: SettlementPlan;
  balances: EffectiveBalance[];
  onShareAsImage: () => void;
  onHighlight?: (playerId: string | null) => void;
}

export function SettlementPanel({
  plan,
  balances,
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

  const totalSettled = plan.txns.reduce((acc, t) => acc + t.amountCents, 0);

  return (
    <section aria-labelledby="settlement-heading" className="card">
      <div className="card-header">
        <span id="settlement-heading" className="ticker-label-strong">
          payments
          <span className="text-fg-mute font-normal ml-2">
            · {plan.txns.length === 0
              ? 'none'
              : `${plan.txns.length} txn${plan.txns.length === 1 ? '' : 's'}`}
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
          <button
            type="button"
            onClick={onShareAsImage}
            disabled={plan.txns.length === 0}
            className="btn btn-fill btn-sm"
            aria-label="Share settlement plan as image"
          >
            share ›
          </button>
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
          {plan.txns.map((t, i) => (
            <SettlementRow
              key={`${t.fromId}-${t.toId}-${i}`}
              index={i + 1}
              fromName={nameById.get(t.fromId) ?? t.fromId}
              toName={nameById.get(t.toId) ?? t.toId}
              amountCents={t.amountCents}
              forced={t.forced}
              onHover={(hover) => onHighlight?.(hover ? t.fromId : null)}
            />
          ))}
        </ol>
      )}

      {plan.txns.length > 0 && (
        <div className="border-t border-line-strong bg-surface-2 px-4 py-2.5 flex items-baseline justify-between">
          <span className="ticker-label-strong">total moved</span>
          <span className="font-mono num font-bold text-[15px] text-fg">
            {formatDollars(totalSettled)}
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
  onHover?: (hovering: boolean) => void;
}

function SettlementRow({
  index,
  fromName,
  toName,
  amountCents,
  forced,
  onHover,
}: SettlementRowProps) {
  const [copied, setCopied] = useState(false);
  const text = `${fromName} → ${toName}: ${formatDollars(amountCents)}`;

  const handleCopy = async () => {
    const ok = await copyText(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1300);
    }
  };

  return (
    <li className="border-b border-line/60 last:border-b-0">
      <button
        type="button"
        onClick={handleCopy}
        onMouseEnter={() => onHover?.(true)}
        onMouseLeave={() => onHover?.(false)}
        className={cn(
          'group w-full text-left py-3 px-4 flex items-center gap-3',
          'transition-colors duration-100',
          'hover:bg-surface-2 active:bg-surface-3',
          'min-h-[52px]'
        )}
        aria-label={`Copy: ${text}`}
      >
        <span className="font-mono num text-fg-mute text-[11px] w-6 flex-shrink-0">
          {String(index).padStart(2, '0')}
        </span>
        <span className="flex-1 min-w-0 flex items-center gap-2 sm:gap-3 font-sans text-[14px]">
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
        <span className="font-mono num font-bold text-[14px] sm:text-[15px] text-fg flex-shrink-0">
          {formatDollars(amountCents)}
        </span>
        <span
          className={cn(
            'ticker-label w-12 text-right',
            'opacity-0 group-hover:opacity-100 transition-opacity',
            copied && 'opacity-100 text-gain'
          )}
          aria-hidden="true"
        >
          {copied ? '✓ copy' : 'copy'}
        </span>
      </button>
    </li>
  );
}
