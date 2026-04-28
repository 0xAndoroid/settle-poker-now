import { useMemo } from 'react';
import type { EffectiveBalance, Group } from '@/lib/types';
import { newId } from '@/lib/id';
import { cn } from '@/lib/cn';

interface GroupsPanelProps {
  balances: EffectiveBalance[];
  groups: Group[];
  onChange: (groups: Group[]) => void;
}

const GROUP_LABELS = [
  'Group A',
  'Group B',
  'Group C',
  'Group D',
  'Group E',
  'Group F',
];

const GROUP_COLORS = [
  'border-purple-400/40 bg-purple-500/10 text-purple-200 dark:text-purple-200',
  'border-emerald-400/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200',
  'border-amber-400/40 bg-amber-500/10 text-amber-700 dark:text-amber-200',
  'border-sky-400/40 bg-sky-500/10 text-sky-700 dark:text-sky-200',
  'border-rose-400/40 bg-rose-500/10 text-rose-700 dark:text-rose-200',
  'border-indigo-400/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-200',
];

export function GroupsPanel({ balances, groups, onChange }: GroupsPanelProps) {
  const effectiveGroups: Group[] = useMemo(
    () =>
      groups.length > 0
        ? groups
        : [{ id: 'all', memberIds: balances.map((b) => b.playerId) }],
    [groups, balances]
  );

  const groupOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of effectiveGroups) {
      for (const id of g.memberIds) {
        map.set(id, g.id);
      }
    }
    return map;
  }, [effectiveGroups]);

  const groupIndex = (groupId: string) =>
    effectiveGroups.findIndex((g) => g.id === groupId);

  const moveToGroup = (playerId: string, targetGroupId: string) => {
    const next: Group[] = effectiveGroups.map((g) => ({
      ...g,
      memberIds: g.memberIds.filter((id) => id !== playerId),
    }));
    const target = next.find((g) => g.id === targetGroupId);
    if (target) target.memberIds.push(playerId);
    // Drop empty groups (except the always-present default).
    const cleaned = next.filter((g, idx) => g.memberIds.length > 0 || idx === 0);
    onChange(cleaned);
  };

  const addGroup = () => {
    if (effectiveGroups.length >= GROUP_LABELS.length) return;
    const newGroup: Group = { id: newId('grp-'), memberIds: [] };
    onChange([...effectiveGroups, newGroup]);
  };

  const resetToOneGroup = () => {
    onChange([]);
  };

  return (
    <section
      aria-labelledby="groups-heading"
      className="surface rounded-2xl overflow-hidden"
    >
      <header className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between gap-3">
        <div>
          <h2 id="groups-heading" className="text-[15px] font-semibold tracking-tight">
            Settlement groups
          </h2>
          <p className="text-xs text-[var(--fg-dim)] mt-0.5">
            Players only settle within their group. Tap a chip to reassign.
          </p>
        </div>
        <div className="flex items-center gap-1">
          {effectiveGroups.length > 1 && (
            <button
              type="button"
              onClick={resetToOneGroup}
              className="btn-ghost"
              aria-label="Reset to a single group"
            >
              Reset
            </button>
          )}
          <button
            type="button"
            onClick={addGroup}
            disabled={effectiveGroups.length >= GROUP_LABELS.length}
            className="btn-ghost"
            aria-label="Add a new group"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add group
          </button>
        </div>
      </header>

      <div className="p-4 sm:p-5 flex flex-wrap gap-2">
        {balances.map((b) => {
          const currentGroupId = groupOf.get(b.playerId) ?? effectiveGroups[0]!.id;
          const idx = groupIndex(currentGroupId);
          const colorClass =
            GROUP_COLORS[idx >= 0 ? idx % GROUP_COLORS.length : 0]!;
          const labelText =
            effectiveGroups.length > 1 && idx >= 0
              ? GROUP_LABELS[idx]?.replace('Group ', '') ?? '?'
              : null;

          return (
            <div key={b.playerId} className="relative group">
              <button
                type="button"
                onClick={() => {
                  // Cycle through groups on tap.
                  const nextIdx = (idx + 1) % effectiveGroups.length;
                  const target = effectiveGroups[nextIdx]!;
                  moveToGroup(b.playerId, target.id);
                }}
                className={cn(
                  'pill border min-h-[44px] px-4 transition-all duration-150',
                  'hover:scale-[1.03] active:scale-95',
                  colorClass
                )}
                aria-label={`${b.nickname} is in ${effectiveGroups.length > 1 ? GROUP_LABELS[idx] ?? 'group' : 'the only group'}. Tap to cycle.`}
              >
                {labelText && (
                  <span className="font-mono text-[10px] font-bold mr-1.5 opacity-70">
                    {labelText}
                  </span>
                )}
                <span className="font-medium text-[13px]">{b.nickname}</span>
              </button>
            </div>
          );
        })}
      </div>

      {effectiveGroups.length > 1 && (
        <div className="px-5 py-3 border-t border-[var(--border)] flex items-center gap-2 text-[11px] text-[var(--fg-mute)]">
          <span>Legend:</span>
          {effectiveGroups.map((g, i) => (
            <span
              key={g.id}
              className={cn(
                'pill border',
                GROUP_COLORS[i % GROUP_COLORS.length]
              )}
            >
              {GROUP_LABELS[i] ?? g.id} · {g.memberIds.length}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

export const GROUP_LABEL_FOR = (groups: Group[], groupId: string): string => {
  if (groupId === 'all') return 'Settlement';
  const idx = groups.findIndex((g) => g.id === groupId);
  return idx >= 0 ? GROUP_LABELS[idx] ?? `Group ${groupId.slice(0, 4)}` : `Group ${groupId.slice(0, 4)}`;
};
