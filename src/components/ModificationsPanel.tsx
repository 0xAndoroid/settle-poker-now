import { formatDollars } from '@/lib/money';
import type {
  PersistedAdjustment,
  PersistedAlias,
  PersistedIsolation,
  PersistedPlayer,
} from '@/lib/types';

interface ModificationsPanelProps {
  players: ReadonlyArray<PersistedPlayer>;
  aliases: ReadonlyArray<PersistedAlias>;
  adjustments: ReadonlyArray<PersistedAdjustment>;
  isolations: ReadonlyArray<PersistedIsolation>;
}

/**
 * Read-only summary of every modification baked into the snapshot at
 * finalize time. Three sub-sections — aliases, adjustments, isolations —
 * each rendering an empty hint when its list is empty so the post-finalize
 * view always has the same vertical rhythm. Pure presentation; the data
 * never mutates here (the finalize lock prevents structural edits, by
 * design).
 */
export function ModificationsPanel({
  players,
  aliases,
  adjustments,
  isolations,
}: ModificationsPanelProps) {
  const nameById = new Map(players.map((p) => [p.playerId, p.nickname]));
  const total = aliases.length + adjustments.length + isolations.length;

  return (
    <section aria-labelledby="mods-heading" className="card">
      <div className="card-header">
        <span id="mods-heading" className="ticker-label-strong">
          modifications applied
        </span>
        <span className="ticker-label">
          {total === 0 ? 'none' : `${total} entr${total === 1 ? 'y' : 'ies'}`}
        </span>
      </div>

      <Subsection
        title="aliases"
        empty="no aliases — every player_id stands alone"
        count={aliases.length}
      >
        {aliases.map((a) => (
          <ModRow key={`alias-${a.playerId}`}>
            <span className="font-semibold text-fg truncate">
              {nameById.get(a.playerId) ?? a.playerId}
            </span>
            <span aria-hidden="true" className="text-fg-mute font-mono shrink-0">
              ↦
            </span>
            <span className="font-semibold text-fg truncate">
              {nameById.get(a.aliasToPlayerId) ?? a.aliasToPlayerId}
            </span>
          </ModRow>
        ))}
      </Subsection>

      <Subsection
        title="prior payments"
        empty="no prior payments recorded"
        count={adjustments.length}
      >
        {adjustments.map((a, idx) => (
          <ModRow key={a.id} index={idx + 1}>
            <span className="font-semibold text-fg truncate">
              {nameById.get(a.fromPlayerId) ?? a.fromPlayerId}
            </span>
            <span aria-hidden="true" className="text-fg-mute font-mono shrink-0">
              ↦
            </span>
            <span className="font-semibold text-fg truncate">
              {nameById.get(a.toPlayerId) ?? a.toPlayerId}
            </span>
            <span className="ml-auto font-mono num font-bold text-fg shrink-0">
              {formatDollars(a.amountCents)}
            </span>
          </ModRow>
        ))}
      </Subsection>

      <Subsection
        title="private rules"
        empty="no isolation rules"
        count={isolations.length}
      >
        {isolations.map((r) => (
          <ModRow key={`iso-${r.playerId}`}>
            <span className="font-semibold text-fg truncate">
              {nameById.get(r.playerId) ?? r.playerId}
            </span>
            <span className="ticker-label">settles only with</span>
            <span className="font-semibold text-fg truncate">
              {nameById.get(r.counterpartId) ?? r.counterpartId}
            </span>
          </ModRow>
        ))}
      </Subsection>
    </section>
  );
}

interface SubsectionProps {
  title: string;
  empty: string;
  count: number;
  children: React.ReactNode;
}

function Subsection({ title, empty, count, children }: SubsectionProps) {
  return (
    <div className="border-b border-line/60 last:border-b-0">
      <div className="px-4 py-2 bg-surface-2 border-b border-line/60 flex items-baseline justify-between gap-2">
        <span className="ticker-label-strong text-fg-dim">{title}</span>
        <span className="ticker-label">{count}</span>
      </div>
      {count === 0 ? (
        <div className="px-4 py-3 text-center text-[11px] text-fg-mute uppercase tracking-ticker">
          — {empty} —
        </div>
      ) : (
        <ul role="list">{children}</ul>
      )}
    </div>
  );
}

interface ModRowProps {
  index?: number;
  children: React.ReactNode;
}

function ModRow({ index, children }: ModRowProps) {
  return (
    <li className="px-4 py-2.5 flex items-center gap-2 border-b border-line/60 last:border-b-0 text-[13px]">
      {index !== undefined && (
        <span className="font-mono num text-fg-mute text-[11px] w-6 flex-shrink-0">
          {String(index).padStart(2, '0')}
        </span>
      )}
      {children}
    </li>
  );
}
