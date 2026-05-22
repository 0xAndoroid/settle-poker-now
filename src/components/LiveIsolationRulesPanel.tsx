import { useMemo, useState, type FormEvent } from 'react';
import type { IsolationRule, LiveGameSnapshot, LivePlayer } from '@/lib/types';

interface LiveIsolationRulesPanelProps {
  snapshot: LiveGameSnapshot;
  isolations: IsolationRule[];
  onChange: (rules: IsolationRule[]) => void;
}

export function LiveIsolationRulesPanel({
  snapshot,
  isolations,
  onChange,
}: LiveIsolationRulesPanelProps) {
  const players = useMemo(() => activePlayers(snapshot), [snapshot]);
  const nameById = useMemo(
    () => new Map(players.map((player) => [player.playerId, player.name])),
    [players]
  );
  const [playerId, setPlayerId] = useState('');
  const [counterpartId, setCounterpartId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const canAdd = players.length >= 2;
  const targetOptions = players.filter((player) => player.playerId !== playerId);
  const replacesExisting = isolations.some((rule) => rule.playerId === playerId);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!playerId || !counterpartId) {
      setError('Pick both players.');
      return;
    }
    if (playerId === counterpartId) {
      setError('Players must differ.');
      return;
    }
    onChange([
      ...isolations.filter((rule) => rule.playerId !== playerId),
      { playerId, counterpartId },
    ]);
    setPlayerId('');
    setCounterpartId('');
  };

  const removeRule = (rulePlayerId: string) => {
    onChange(isolations.filter((rule) => rule.playerId !== rulePlayerId));
  };

  const playerName = (id: string) => nameById.get(id) ?? id;

  return (
    <section className="card" aria-labelledby="live-isolation-rules-heading">
      <div className="card-header">
        <span id="live-isolation-rules-heading" className="ticker-label-strong">
          isolation rules
        </span>
        <span className="ticker-label">{isolations.length} active</span>
      </div>

      <form onSubmit={submit} className="p-4 space-y-3 border-b border-line">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <PlayerSelect
            id="live-isolation-player"
            label="player"
            value={playerId}
            onChange={(next) => {
              setPlayerId(next);
              if (next === counterpartId) setCounterpartId('');
            }}
            players={players}
            disabled={!canAdd}
          />
          <PlayerSelect
            id="live-isolation-counterpart"
            label="only with"
            value={counterpartId}
            onChange={setCounterpartId}
            players={targetOptions}
            disabled={!canAdd || !playerId}
          />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-[12px] text-fg-dim leading-relaxed">
            Player A can only settle with Player B.
          </p>
          <button type="submit" className="btn btn-fill h-11 w-full sm:w-auto" disabled={!canAdd}>
            {replacesExisting ? 'update' : 'add'}
          </button>
        </div>

        {error && (
          <p className="text-loss text-[12px] font-semibold" role="alert">
            {error}
          </p>
        )}
      </form>

      {isolations.length === 0 ? (
        <div className="px-5 py-8 text-center text-[13px] text-fg-dim">
          No isolation rules.
        </div>
      ) : (
        <ul role="list">
          {isolations.map((rule) => (
            <li
              key={rule.playerId}
              className="border-b border-line last:border-b-0 p-4 flex items-center justify-between gap-3"
            >
              <div>
                <p className="text-[14px] font-semibold text-fg">
                  {playerName(rule.playerId)}
                </p>
                <p className="text-[12px] text-fg-dim mt-1">
                  only settles with {playerName(rule.counterpartId)}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-sm min-h-[36px]"
                onClick={() => removeRule(rule.playerId)}
              >
                delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PlayerSelect({
  id,
  label,
  value,
  onChange,
  players,
  disabled = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  players: LivePlayer[];
  disabled?: boolean;
}) {
  return (
    <label htmlFor={id} className="block space-y-1.5">
      <span className="ticker-label">{label}</span>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="field font-sans font-semibold text-[13px] pr-8 disabled:opacity-50"
        style={selectArrowStyle}
      >
        <option value="">pick {label}</option>
        {players.map((player) => (
          <option key={player.playerId} value={player.playerId}>
            {player.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function activePlayers(snapshot: LiveGameSnapshot): LivePlayer[] {
  return snapshot.players
    .filter((player) => player.status !== 'removed')
    .slice()
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a.name.localeCompare(b.name) ||
        a.playerId.localeCompare(b.playerId)
    );
}

const selectArrowStyle = {
  backgroundImage:
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' stroke='%239595a8' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  appearance: 'none',
} as const;
