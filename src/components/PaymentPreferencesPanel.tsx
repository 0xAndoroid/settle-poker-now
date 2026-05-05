import { cn } from '@/lib/cn';
import type { EffectiveBalance, PaymentPreference, PaymentRail } from '@/lib/types';

interface PaymentPreferencesPanelProps {
  balances: EffectiveBalance[];
  preferences: PaymentPreference[];
  onChange: (next: PaymentPreference[]) => void;
}

export function PaymentPreferencesPanel({
  balances,
  preferences,
  onChange,
}: PaymentPreferencesPanelProps) {
  const preferenceByPlayer = new Map(
    preferences.map((preference) => [preference.playerId, preference.rail])
  );
  const sorted = balances
    .slice()
    .sort((a, b) => a.nickname.localeCompare(b.nickname) || a.playerId.localeCompare(b.playerId));
  const venmoCount = sorted.filter(
    (p) => preferenceByPlayer.get(p.playerId) === 'venmo'
  ).length;
  const zelleCount = sorted.filter(
    (p) => preferenceByPlayer.get(p.playerId) === 'zelle'
  ).length;
  const visiblePlayerIds = new Set(sorted.map((p) => p.playerId));

  const setPreference = (playerId: string, rail: PaymentRail) => {
    const current = preferenceByPlayer.get(playerId);
    const next = preferences.filter(
      (p) => p.playerId !== playerId && visiblePlayerIds.has(p.playerId)
    );
    if (current !== rail) next.push({ playerId, rail });
    onChange(
      next.sort(
        (a, b) =>
          a.rail.localeCompare(b.rail) || a.playerId.localeCompare(b.playerId)
      )
    );
  };

  return (
    <section aria-labelledby="payment-preferences-heading" className="card">
      <div className="card-header">
        <span id="payment-preferences-heading" className="ticker-label-strong">
          payment prefs
        </span>
        <span className="ticker-label">
          venmo {venmoCount} · zelle {zelleCount}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-line/70">
        <PreferenceColumn
          title="prefers only venmo"
          rail="venmo"
          players={sorted}
          preferenceByPlayer={preferenceByPlayer}
          onToggle={setPreference}
        />
        <PreferenceColumn
          title="prefers only zelle"
          rail="zelle"
          players={sorted}
          preferenceByPlayer={preferenceByPlayer}
          onToggle={setPreference}
        />
      </div>
    </section>
  );
}

interface PreferenceColumnProps {
  title: string;
  rail: PaymentRail;
  players: EffectiveBalance[];
  preferenceByPlayer: ReadonlyMap<string, PaymentRail>;
  onToggle: (playerId: string, rail: PaymentRail) => void;
}

function PreferenceColumn({
  title,
  rail,
  players,
  preferenceByPlayer,
  onToggle,
}: PreferenceColumnProps) {
  return (
    <div>
      <div className="px-4 py-2.5 border-b border-line/70 bg-surface-2">
        <span className="ticker-label-strong">{title}</span>
      </div>
      <div className="divide-y divide-line/50">
        {players.map((player) => {
          const checked = preferenceByPlayer.get(player.playerId) === rail;
          const claimedElsewhere =
            preferenceByPlayer.has(player.playerId) && !checked;
          return (
            <label
              key={`${rail}-${player.playerId}`}
              className={cn(
                'min-h-[42px] px-4 py-2.5 flex items-center gap-3 cursor-pointer transition-colors',
                checked && 'bg-accent/[0.08]',
                claimedElsewhere && 'text-fg-mute'
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(player.playerId, rail)}
                className="checkbox-poker"
                aria-label={`${player.nickname} ${title}`}
              />
              <span
                className={cn(
                  'font-sans font-semibold text-[13px] truncate',
                  checked ? 'text-fg' : 'text-fg-dim'
                )}
              >
                {player.nickname}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
