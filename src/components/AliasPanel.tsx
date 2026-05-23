import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { FormError, PlayerSelectField } from './FormControls';
import type { PersistedAlias, PersistedPlayer } from '@/lib/types';

interface AliasPanelProps {
  /** Raw players from the snapshot (pre-collapse). */
  players: ReadonlyArray<PersistedPlayer>;
  /** Current alias rules from the snapshot. */
  aliases: ReadonlyArray<PersistedAlias>;
  onAddAlias: (input: { playerId: string; aliasToPlayerId: string }) => Promise<void>;
  onRemoveAlias: (playerId: string) => Promise<void>;
}

/**
 * Lets the user fold one PokerNow `player_id` into another. The
 * canonical (target) player gets the duplicate's net added; the
 * duplicate disappears from the active roster everywhere — Balance
 * Sheet, Settlement plan, isolation rules, adjustments. Removing the
 * alias restores the original split balances.
 */
export function AliasPanel({
  players,
  aliases,
  onAddAlias,
  onRemoveAlias,
}: AliasPanelProps) {
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const sortedPlayers = useMemo(
    () => players.slice().sort((a, b) => a.nickname.localeCompare(b.nickname)),
    [players]
  );
  const aliasedSet = useMemo(
    () => new Set(aliases.map((a) => a.playerId)),
    [aliases]
  );
  const nameById = useMemo(
    () => new Map(players.map((p) => [p.playerId, p.nickname])),
    [players]
  );
  const canonicalOptions = useMemo(
    () => sortedPlayers.filter((player) => player.playerId !== fromId),
    [fromId, sortedPlayers]
  );

  useEffect(() => {
    if (fromId && toId === fromId) setToId('');
  }, [fromId, toId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!fromId || !toId) {
      setError('Pick both players.');
      return;
    }
    if (fromId === toId) {
      setError('Cannot alias a player to themselves.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onAddAlias({ playerId: fromId, aliasToPlayerId: toId });
      setFromId('');
      setToId('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section aria-labelledby="alias-heading" className="card">
      <div className="card-header">
        <span id="alias-heading" className="ticker-label-strong">
          aliases
        </span>
        <span className="ticker-label">{aliases.length} active</span>
      </div>

      <form
        onSubmit={handleSubmit}
        className="px-4 py-4 border-b border-line bg-surface-2 space-y-3"
      >
        <p className="text-[12.5px] leading-relaxed text-fg-dim">
          Same person showed up twice (reconnected, rebought)? Fold the
          duplicate into the canonical player.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2 items-end">
          <PlayerSelectField
            id="alias-from"
            label="duplicate"
            value={fromId}
            onChange={setFromId}
            options={sortedPlayers.map((player) => ({
              value: player.playerId,
              label: player.nickname,
              disabled: aliasedSet.has(player.playerId),
              disabledSuffix: ' (already aliased)',
            }))}
            placeholder="— pick duplicate —"
            selectClassName="field font-sans font-semibold text-[14px] pr-8"
          />
          <span
            aria-hidden="true"
            className="hidden sm:flex items-end pb-2.5 justify-center text-fg-mute font-mono"
          >
            ↦
          </span>
          <PlayerSelectField
            id="alias-to"
            label="canonical"
            value={toId}
            onChange={setToId}
            options={canonicalOptions.map((player) => ({
              value: player.playerId,
              label: player.nickname,
            }))}
            placeholder="— pick canonical —"
            selectClassName="field font-sans font-semibold text-[14px] pr-8"
            // Allow targeting any player; the server canonicalizes the
            // chain, so picking an aliased target collapses to its hub.
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting || !fromId || !toId || fromId === toId}
            className="btn btn-fill btn-sm"
          >
            {submitting ? 'folding…' : 'fold ›'}
          </button>
          {error && <FormError className="flex-1">{error}</FormError>}
        </div>
      </form>

      {aliases.length === 0 ? (
        <div className="px-4 py-3 text-center text-[11px] text-fg-mute uppercase tracking-ticker">
          — no aliases —
        </div>
      ) : (
        <ul role="list">
          {aliases.map((a, idx) => (
            <li
              key={a.playerId}
              className="px-4 py-2.5 flex items-center gap-3 border-b border-line/60 last:border-b-0 text-[13px]"
            >
              <span className="font-mono num text-fg-mute text-[11px] w-6 flex-shrink-0">
                {String(idx + 1).padStart(2, '0')}
              </span>
              <div className="flex-1 min-w-0 flex items-center gap-2 font-sans">
                <span className="font-semibold text-fg truncate">
                  {nameById.get(a.playerId) ?? a.playerId}
                </span>
                <span aria-hidden="true" className="text-fg-mute font-mono shrink-0">
                  ↦
                </span>
                <span className="font-semibold text-fg truncate">
                  {nameById.get(a.aliasToPlayerId) ?? a.aliasToPlayerId}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  void onRemoveAlias(a.playerId);
                }}
                className="btn btn-ghost btn-sm"
                aria-label={`Unfold ${nameById.get(a.playerId) ?? a.playerId}`}
              >
                ✕ unfold
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
