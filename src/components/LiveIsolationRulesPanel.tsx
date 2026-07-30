import { useMemo, useState, type FormEvent } from 'react';
import { EmptyPanelMessage, FormError, PlayerSelectField } from './FormControls';
import { activeLivePlayers } from '@/lib/livePlayers';
import type { IsolationRule, LiveGameSnapshot } from '@/lib/types';

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
  const players = useMemo(() => activeLivePlayers(snapshot), [snapshot]);
  const nameById = useMemo(
    () => new Map(players.map((player) => [player.playerId, player.name])),
    [players]
  );
  const [playerId, setPlayerId] = useState('');
  const [counterpartId, setCounterpartId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const canAdd = players.length >= 2;
  const targetOptions = players.filter((player) => player.playerId !== playerId);
  const playerOptions = useMemo(
    () => players.map((player) => ({ value: player.playerId, label: player.name })),
    [players]
  );
  const counterpartOptions = useMemo(
    () => targetOptions.map((player) => ({ value: player.playerId, label: player.name })),
    [targetOptions]
  );
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
    <section className="card kc-orange" aria-labelledby="live-isolation-rules-heading">
      <div className="card-header">
        <span id="live-isolation-rules-heading" className="ticker-label-strong">
          isolation rules
        </span>
        <span className="ticker-label">{isolations.length} active</span>
      </div>

      <form onSubmit={submit} className="p-4 space-y-3 border-b border-line">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <PlayerSelectField
            id="live-isolation-player"
            label="player"
            value={playerId}
            onChange={(next) => {
              setPlayerId(next);
              if (next === counterpartId) setCounterpartId('');
            }}
            options={playerOptions}
            placeholder="pick player"
            disabled={!canAdd}
          />
          <PlayerSelectField
            id="live-isolation-counterpart"
            label="only with"
            value={counterpartId}
            onChange={setCounterpartId}
            options={counterpartOptions}
            placeholder="pick only with"
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

        {error && <FormError>{error}</FormError>}
      </form>

      {isolations.length === 0 ? (
        <EmptyPanelMessage>No isolation rules.</EmptyPanelMessage>
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
