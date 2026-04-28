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
    <section
      aria-labelledby="isolation-heading"
      className="slab"
    >
      <div className="slab-heading">
        <span id="isolation-heading">private ledgers</span>
        <span className="text-mute font-normal normal-case tracking-normal text-[10.5px]">
          {isolations.length} of {balances.length} isolated
        </span>
      </div>

      <div className="px-5 py-3 border-b border-hairline bg-paper-2">
        <p className="text-[12px] leading-relaxed text-ink-2">
          Mark a player as <span className="font-bold">isolated</span> to settle them
          with one specific counterpart only. The counterpart absorbs their
          obligation and settles freely with everyone else.
        </p>
      </div>

      <ul role="list" className="font-mono">
        {sorted.map((b, idx) => {
          const rule = ruleByPlayer.get(b.playerId);
          const inCycle = cycleSet.has(b.playerId);

          return (
            <li
              key={b.playerId}
              className={cn(
                'px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3',
                idx > 0 && 'border-t border-hairline',
                inCycle && 'bg-loss/[0.04]'
              )}
            >
              <span className="text-mute text-[11px] tabular-nums w-5 flex-shrink-0 hidden sm:inline">
                {String(idx + 1).padStart(2, '0')}
              </span>
              <span className="font-bold text-[13px] flex-shrink-0 min-w-[100px]">
                {b.nickname}
              </span>

              <div className="flex-1 flex items-center gap-2 sm:gap-3 flex-wrap">
                <span className="text-mute text-[12px] italic lowercase">
                  &nbsp;{rule ? 'settles only with' : 'open to all'}&nbsp;
                </span>
                <select
                  value={rule?.counterpartId ?? ''}
                  onChange={(e) =>
                    setRule(b.playerId, e.target.value || null)
                  }
                  className={cn(
                    'font-mono text-[13px] font-bold bg-paper border-b-2 border-ink',
                    'px-2 py-1 min-h-[36px] focus:bg-paper-2 outline-none',
                    inCycle && 'border-loss text-loss'
                  )}
                  aria-label={`Counterpart for ${b.nickname}`}
                >
                  <option value="">— anyone —</option>
                  {balances
                    .filter((x) => x.playerId !== b.playerId)
                    .map((x) => (
                      <option key={x.playerId} value={x.playerId}>
                        {x.nickname}
                      </option>
                    ))}
                </select>

                {inCycle && (
                  <span className="text-loss text-[11px] uppercase tracking-all font-bold">
                    ⚠ cycle
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
