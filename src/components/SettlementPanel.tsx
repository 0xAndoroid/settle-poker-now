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
    <section aria-labelledby="settlement-heading" className="slab">
      <div className="slab-heading">
        <span id="settlement-heading">
          payments due
          <span className="ml-3 text-mute">
            — {plan.txns.length === 0
              ? 'none'
              : `${plan.txns.length} payment${plan.txns.length === 1 ? '' : 's'}`}
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
        <div className="px-5 py-4 border-b border-ink bg-paper-2">
          <p className="text-[10px] uppercase tracking-masthead font-bold text-loss mb-1.5">
            ⚠ isolation cycle detected
          </p>
          <p className="text-[12.5px] leading-relaxed text-ink-2">
            <span className="font-bold">{cycleNames.join(' → ')}</span>
            {' '}form a cycle of isolation rules. Break the cycle in
            “private ledgers” to settle these players.
          </p>
        </div>
      )}

      {plan.txns.length === 0 ? (
        <div className="px-6 py-8 text-center">
          <p className="font-bold text-[13px] uppercase tracking-all">
            {hasCycle ? '— pending —' : 'already settled.'}
          </p>
          {!hasCycle && (
            <p className="text-[11.5px] text-mute mt-1">
              No payments necessary. Everybody&apos;s even.
            </p>
          )}
        </div>
      ) : (
        <ol className="font-mono">
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
        <div className="border-t-2 border-ink px-5 py-3 flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-masthead font-bold">total moved</span>
          <span className="font-mono font-extrabold text-[15px] tabular-nums">
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
    <li className="border-b border-hairline last:border-b-0">
      <button
        type="button"
        onClick={handleCopy}
        onMouseEnter={() => onHover?.(true)}
        onMouseLeave={() => onHover?.(false)}
        className={cn(
          'group w-full text-left py-3 px-5 flex items-center gap-3 sm:gap-4',
          'transition-colors duration-100',
          'hover:bg-paper-2 active:bg-paper-3',
          'min-h-[52px]'
        )}
        aria-label={`Copy: ${text}`}
      >
        <span className="text-mute text-[11px] tabular-nums w-5 flex-shrink-0">
          {String(index).padStart(2, '0')}
        </span>
        <span className="flex-1 min-w-0 flex items-center gap-2 sm:gap-3 text-[13px] sm:text-[14px]">
          <span className="font-bold truncate flex-shrink min-w-0 underline decoration-loss decoration-1 underline-offset-[3px]">
            {fromName}
          </span>
          <span aria-hidden="true" className="text-mute flex-shrink-0">→</span>
          <span className="font-bold truncate flex-shrink min-w-0">
            {toName}
          </span>
          {forced && (
            <span className="cell text-[9px] tracking-masthead py-0 hidden sm:inline-flex">
              isolated
            </span>
          )}
        </span>
        <span className="font-extrabold text-[14px] sm:text-[15px] tabular-nums flex-shrink-0">
          {formatDollars(amountCents)}
        </span>
        <span
          className={cn(
            'text-[10px] uppercase tracking-all w-12 text-right text-mute',
            'opacity-0 group-hover:opacity-100 transition-opacity',
            copied && 'opacity-100 text-ink font-bold'
          )}
          aria-hidden="true"
        >
          {copied ? '✓ copy' : 'copy'}
        </span>
      </button>
    </li>
  );
}
