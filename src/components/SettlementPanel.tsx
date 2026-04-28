import { useState } from 'react';
import { formatDollars, formatNet } from '@/lib/money';
import type { EffectiveBalance, GroupSettlement, SettlementPlan } from '@/lib/types';
import { copyText } from '@/lib/clipboard';
import { cn } from '@/lib/cn';

interface SettlementPanelProps {
  plan: SettlementPlan;
  balances: EffectiveBalance[];
  /** Total number of groups configured by user (for labelling). */
  groupLabels?: Record<string, string>;
  onShareAsImage: () => void;
  onHighlight?: (playerId: string | null) => void;
}

export function SettlementPanel({
  plan,
  balances,
  groupLabels,
  onShareAsImage,
  onHighlight,
}: SettlementPanelProps) {
  const nameById = new Map(balances.map((b) => [b.playerId, b.nickname]));
  const txnLine = (fromId: string, toId: string, cents: number) =>
    `${nameById.get(fromId) ?? fromId} → ${nameById.get(toId) ?? toId}: ${formatDollars(cents)}`;

  const [copyAllState, setCopyAllState] = useState<'idle' | 'copied'>('idle');

  const allLines = plan.txns.map((t) => txnLine(t.fromId, t.toId, t.amountCents)).join('\n');

  const handleCopyAll = async () => {
    if (!allLines) return;
    const ok = await copyText(allLines);
    if (ok) {
      setCopyAllState('copied');
      setTimeout(() => setCopyAllState('idle'), 1600);
    }
  };

  const renderGroup = (group: GroupSettlement) => {
    const label =
      groupLabels?.[group.groupId] ??
      (group.groupId === 'all' ? 'Settlement' : `Group ${group.groupId.slice(0, 6)}`);

    return (
      <div key={group.groupId} className="space-y-3">
        {(plan.groups.length > 1 || group.isImbalanced) && (
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[13px] font-semibold text-[var(--fg-dim)] uppercase tracking-wide">
              {label}
            </h3>
            {group.isImbalanced && (
              <div className="pill bg-loss/10 text-loss border border-loss/20">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                Off by {formatNet(group.imbalanceCents)}
              </div>
            )}
          </div>
        )}

        {group.txns.length === 0 ? (
          <div className="surface-2 rounded-xl p-4 text-center text-sm text-[var(--fg-dim)]">
            {group.isImbalanced
              ? 'Group cannot settle — fix imbalance.'
              : 'Already settled. ✨'}
          </div>
        ) : (
          <ul role="list" className="space-y-2">
            {group.txns.map((t, i) => (
              <SettlementRow
                key={`${group.groupId}-${i}`}
                fromName={nameById.get(t.fromId) ?? t.fromId}
                toName={nameById.get(t.toId) ?? t.toId}
                amountCents={t.amountCents}
                onHover={(hover) => onHighlight?.(hover ? t.fromId : null)}
              />
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <section
      aria-labelledby="settlement-heading"
      className="surface rounded-2xl overflow-hidden"
    >
      <header className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between gap-3">
        <div>
          <h2 id="settlement-heading" className="text-[15px] font-semibold tracking-tight">
            Settlement plan
          </h2>
          <p className="text-xs text-[var(--fg-dim)] mt-0.5">
            {plan.txns.length === 0
              ? 'Nothing to settle'
              : `${plan.txns.length} payment${plan.txns.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleCopyAll}
            disabled={plan.txns.length === 0}
            className="btn-ghost"
            aria-label="Copy all settlement instructions to clipboard"
          >
            {copyAllState === 'copied' ? (
              <>
                <CheckIcon />
                <span className="hidden sm:inline">Copied</span>
              </>
            ) : (
              <>
                <CopyIcon />
                <span className="hidden sm:inline">Copy all</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onShareAsImage}
            disabled={plan.txns.length === 0}
            className="btn-primary px-3 py-2 min-h-[40px] text-sm"
            aria-label="Share settlement plan as image"
          >
            <ShareIcon />
            <span>Share</span>
          </button>
        </div>
      </header>

      <div className="p-5 space-y-6">
        {plan.groups.map(renderGroup)}
      </div>
    </section>
  );
}

interface SettlementRowProps {
  fromName: string;
  toName: string;
  amountCents: number;
  onHover?: (hovering: boolean) => void;
}

function SettlementRow({ fromName, toName, amountCents, onHover }: SettlementRowProps) {
  const [copied, setCopied] = useState(false);
  const text = `${fromName} → ${toName}: ${formatDollars(amountCents)}`;

  const handleCopy = async () => {
    const ok = await copyText(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }
  };

  return (
    <li>
      <button
        type="button"
        onClick={handleCopy}
        onMouseEnter={() => onHover?.(true)}
        onMouseLeave={() => onHover?.(false)}
        className={cn(
          'group w-full text-left rounded-xl px-4 py-3 surface-2',
          'flex items-center gap-3 sm:gap-4',
          'transition-all duration-150',
          'hover:border-accent/40 hover:bg-accent/5',
          'active:scale-[0.99]',
          'min-h-[56px]'
        )}
        aria-label={`Copy: ${text}`}
      >
        <div className="flex-1 min-w-0 flex items-center gap-2 sm:gap-3 font-mono text-[13px] sm:text-[14px]">
          <span className="font-medium text-loss truncate flex-shrink min-w-0">{fromName}</span>
          <ArrowIcon />
          <span className="font-medium text-win truncate flex-shrink min-w-0">{toName}</span>
        </div>
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <span className="font-mono font-semibold text-[14px] sm:text-[15px] tabular-nums">
            {formatDollars(amountCents)}
          </span>
          <span
            className={cn(
              'w-7 h-7 rounded-md inline-flex items-center justify-center',
              'opacity-0 group-hover:opacity-100 transition-opacity',
              copied && 'opacity-100 text-win'
            )}
            aria-hidden="true"
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </span>
        </div>
      </button>
    </li>
  );
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--fg-mute)] flex-shrink-0" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}
