import { useMemo } from 'react';
import type { EffectiveBalance, IsolationRule } from '@/lib/types';
import { cn } from '@/lib/cn';

interface IsolationPanelProps {
  balances: EffectiveBalance[];
  isolations: IsolationRule[];
  cyclePlayerIds: string[];
  onChange: (rules: IsolationRule[]) => void;
}

export function IsolationPanel({
  balances,
  isolations,
  cyclePlayerIds,
  onChange,
}: IsolationPanelProps) {
  const ruleByPlayer = useMemo(() => {
    const m = new Map<string, IsolationRule>();
    for (const r of isolations) m.set(r.playerId, r);
    return m;
  }, [isolations]);

  const cycleSet = useMemo(() => new Set(cyclePlayerIds), [cyclePlayerIds]);

  const sorted = balances
    .slice()
    .sort((a, b) => a.nickname.localeCompare(b.nickname));

  const setRule = (playerId: string, counterpartId: string | null) => {
    const filtered = isolations.filter((r) => r.playerId !== playerId);
    if (counterpartId) {
      filtered.push({ playerId, counterpartId });
    }
    onChange(filtered);
  };

  return (
    <section aria-labelledby="isolation-heading" className="card kc-orange">
      <div className="card-header">
        <span id="isolation-heading" className="ticker-label-strong">
          private rules
        </span>
        <span className="ticker-label">
          {isolations.length} of {balances.length} isolated
        </span>
      </div>

      <div className="px-4 py-3 border-b border-line bg-fill-1">
        <p className="text-[12.5px] leading-relaxed text-fg-dim">
          Mark a player as <span className="text-fg font-semibold">isolated</span> to
          settle them with one specific counterpart only. The counterpart
          absorbs their obligation and settles freely with everyone else.
        </p>
      </div>

      <ul role="list">
        {sorted.map((b, idx) => {
          const rule = ruleByPlayer.get(b.playerId);
          const inCycle = cycleSet.has(b.playerId);

          return (
            <li
              key={b.playerId}
              className={cn(
                'px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 border-b border-line last:border-b-0',
                inCycle && 'bg-loss/5'
              )}
            >
              <span className="num text-fg-mute text-[11px] w-6 flex-shrink-0 hidden sm:inline">
                {String(idx + 1).padStart(2, '0')}
              </span>
              <span className="font-sans font-semibold text-[14px] flex-shrink-0 min-w-[100px] text-fg">
                {b.nickname}
              </span>

              <div className="flex-1 flex items-center gap-2 sm:gap-3 flex-wrap">
                <span className="ticker-label">
                  {rule ? 'settles only with' : 'open to all'}
                </span>
                <select
                  value={rule?.counterpartId ?? ''}
                  onChange={(e) =>
                    setRule(b.playerId, e.target.value || null)
                  }
                  className={cn(
                    'font-sans text-[12px] font-semibold bg-fill-1 border border-line-strong text-fg rounded-[9px]',
                    'pl-2.5 pr-8 py-1.5 min-h-[32px]',
                    'transition-colors hover:border-accent/60 focus:border-accent/60 outline-none',
                    'select-field',
                    inCycle && 'border-loss text-loss'
                  )}
                  aria-label={`Counterpart for ${b.nickname}`}
                >
                  <option value="">—</option>
                  {balances
                    .filter((x) => x.playerId !== b.playerId)
                    .map((x) => (
                      <option key={x.playerId} value={x.playerId}>
                        {x.nickname}
                      </option>
                    ))}
                </select>

                {inCycle && (
                  <span className="pill pill-loss">⚠ cycle</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
