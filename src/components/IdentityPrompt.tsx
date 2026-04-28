import { useState } from 'react';
import type { PersistedPlayer } from '@/lib/types';
import { cn } from '@/lib/cn';

interface IdentityPromptProps {
  players: ReadonlyArray<PersistedPlayer>;
  onPick: (player: { playerId: string; nickname: string } | null) => void;
}

/**
 * Inline identity picker rendered above the settlement plan when no
 * identity is stored yet for this game. The user picks "I am ___" from the
 * roster (or chooses spectator). The choice is persisted in localStorage
 * by the caller.
 */
export function IdentityPrompt({ players, onPick }: IdentityPromptProps) {
  const [pendingId, setPendingId] = useState<string>('');

  const sorted = players
    .slice()
    .sort((a, b) => a.nickname.localeCompare(b.nickname));

  const handleConfirm = () => {
    if (pendingId === '__spectator') {
      onPick(null);
      return;
    }
    const picked = sorted.find((p) => p.playerId === pendingId);
    if (picked) {
      onPick({ playerId: picked.playerId, nickname: picked.nickname });
    }
  };

  return (
    <section
      aria-labelledby="identity-heading"
      className="card border-accent/60"
    >
      <div className="card-header bg-accent/[0.08]">
        <span id="identity-heading" className="ticker-label-strong text-accent">
          identify yourself
        </span>
        <span className="ticker-label">audit-log only</span>
      </div>
      <div className="px-4 py-4 space-y-3">
        <p className="text-[12.5px] text-fg-dim leading-relaxed">
          Pick the player you are at the table. Anyone can mark any payment
          complete — your name only flows into the audit history so the
          group knows who marked what.
        </p>
        <div className="flex flex-wrap gap-2">
          {sorted.map((p) => {
            const active = pendingId === p.playerId;
            return (
              <button
                key={p.playerId}
                type="button"
                onClick={() => setPendingId(p.playerId)}
                className={cn(
                  'min-h-[36px] px-3 font-sans text-[13px] font-semibold border',
                  active
                    ? 'border-accent bg-accent text-white'
                    : 'border-line-strong bg-surface text-fg-dim hover:text-fg hover:border-accent/60'
                )}
              >
                {p.nickname}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setPendingId('__spectator')}
            className={cn(
              'min-h-[36px] px-3 font-sans text-[13px] font-semibold border italic',
              pendingId === '__spectator'
                ? 'border-accent bg-accent text-white'
                : 'border-line-strong bg-surface text-fg-dim hover:text-fg hover:border-accent/60'
            )}
          >
            spectator
          </button>
        </div>
        <div className="pt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!pendingId}
            className="btn btn-fill btn-sm"
          >
            continue ›
          </button>
          <span className="ticker-label">stored locally · per game</span>
        </div>
      </div>
    </section>
  );
}
