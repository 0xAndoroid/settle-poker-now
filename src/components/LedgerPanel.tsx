import { ledgerBalances } from '@/lib/csv';
import { formatNet } from '@/lib/money';
import type { EffectiveBalance, LedgerRow } from '@/lib/types';
import { cn } from '@/lib/cn';

interface LedgerPanelProps {
  rows: LedgerRow[];
  effectiveBalances: EffectiveBalance[];
  /** Optional: highlight a player on hover/focus from the settlement panel. */
  highlightedPlayerId?: string | null;
  onHighlight?: (playerId: string | null) => void;
}

export function LedgerPanel({
  rows,
  effectiveBalances,
  highlightedPlayerId,
  onHighlight,
}: LedgerPanelProps) {
  const balanceById = new Map(effectiveBalances.map((b) => [b.playerId, b]));
  const ledgerCheck = ledgerBalances(rows);
  const hasAdjustments = effectiveBalances.some(
    (b) => b.effectiveNetCents !== b.originalNetCents
  );

  return (
    <section
      aria-labelledby="ledger-heading"
      className="surface rounded-2xl overflow-hidden"
    >
      <header className="px-5 py-4 flex items-center justify-between border-b border-[var(--border)]">
        <div>
          <h2
            id="ledger-heading"
            className="text-[15px] font-semibold tracking-tight"
          >
            Ledger
          </h2>
          <p className="text-xs text-[var(--fg-dim)] mt-0.5">
            {rows.length} player{rows.length === 1 ? '' : 's'}
            {hasAdjustments ? ' · adjusted' : ''}
          </p>
        </div>
        {!ledgerCheck.isBalanced && (
          <div
            role="alert"
            className="pill bg-loss/10 text-loss border border-loss/20"
            title={`Ledger off by ${formatNet(ledgerCheck.sumCents)}`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Off by {formatNet(ledgerCheck.sumCents)}
          </div>
        )}
      </header>

      <ul role="list" className="divide-y divide-[var(--border)]">
        {effectiveBalances
          .slice()
          .sort(
            (a, b) =>
              b.effectiveNetCents - a.effectiveNetCents ||
              a.playerId.localeCompare(b.playerId)
          )
          .map((b) => {
            const original = balanceById.get(b.playerId);
            const adjusted =
              original && original.originalNetCents !== b.effectiveNetCents;
            const isWin = b.effectiveNetCents > 0;
            const isLoss = b.effectiveNetCents < 0;
            const isHighlighted = highlightedPlayerId === b.playerId;

            return (
              <li
                key={b.playerId}
                onMouseEnter={() => onHighlight?.(b.playerId)}
                onMouseLeave={() => onHighlight?.(null)}
                className={cn(
                  'px-5 py-3 flex items-center justify-between gap-3 transition-colors',
                  isHighlighted && 'bg-[var(--bg-elev-2)]'
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <PlayerAvatar nickname={b.nickname} />
                  <div className="min-w-0">
                    <div className="font-medium text-[14px] truncate" title={b.nickname}>
                      {b.nickname}
                    </div>
                    {adjusted && (
                      <div className="text-[11px] text-[var(--fg-mute)] font-mono mt-0.5">
                        was {formatNet(b.originalNetCents)}
                      </div>
                    )}
                  </div>
                </div>
                <div
                  className={cn(
                    'font-mono text-[14px] font-medium tabular-nums',
                    isWin && 'text-win',
                    isLoss && 'text-loss',
                    !isWin && !isLoss && 'text-[var(--fg-mute)]'
                  )}
                >
                  {formatNet(b.effectiveNetCents)}
                </div>
              </li>
            );
          })}
      </ul>
    </section>
  );
}

const AVATAR_PALETTE = [
  'bg-purple-500/20 text-purple-300 dark:text-purple-200',
  'bg-emerald-500/20 text-emerald-700 dark:text-emerald-200',
  'bg-amber-500/20 text-amber-700 dark:text-amber-200',
  'bg-sky-500/20 text-sky-700 dark:text-sky-200',
  'bg-rose-500/20 text-rose-700 dark:text-rose-200',
  'bg-indigo-500/20 text-indigo-700 dark:text-indigo-200',
  'bg-teal-500/20 text-teal-700 dark:text-teal-200',
  'bg-orange-500/20 text-orange-700 dark:text-orange-200',
];

function PlayerAvatar({ nickname }: { nickname: string }) {
  const initials = nickname
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  // Stable color from name hash.
  let hash = 0;
  for (let i = 0; i < nickname.length; i++) {
    hash = (hash * 31 + nickname.charCodeAt(i)) | 0;
  }
  const color = AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]!;
  return (
    <div
      className={cn(
        'w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0',
        color
      )}
      aria-hidden="true"
    >
      {initials || '?'}
    </div>
  );
}
