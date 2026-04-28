import { useEffect, useState } from 'react';
import type {
  PersistedPaymentMethod,
  PersistedPlayer,
  ZelleHandleKind,
} from '@/lib/types';
import { cn } from '@/lib/cn';

export interface IdentityPickResult {
  player: { playerId: string; nickname: string } | null;
  /**
   * Per-game payment handles for the picked player. `null` when the user
   * picks spectator (we don't write payment methods for non-players) or
   * when both fields are empty.
   */
  paymentMethods: {
    venmoUsername: string | null;
    zelleHandle: string | null;
    zelleHandleKind: ZelleHandleKind | null;
  } | null;
}

interface IdentityPromptProps {
  players: ReadonlyArray<PersistedPlayer>;
  /**
   * Existing payment methods on file (so the form pre-fills if the user
   * had registered Venmo/Zelle in a prior session).
   */
  paymentMethodsByPlayerId?: ReadonlyMap<string, PersistedPaymentMethod>;
  onPick: (result: IdentityPickResult) => void;
}

/**
 * Inline identity picker rendered above the settlement plan when no
 * identity is stored yet for this game. The user picks "I am ___" from the
 * roster (or chooses spectator), and — if they're a player — registers
 * optional Venmo / Zelle handles so settlement rows targeting them can
 * surface deep-link icons.
 */
export function IdentityPrompt({
  players,
  paymentMethodsByPlayerId,
  onPick,
}: IdentityPromptProps) {
  const [pendingId, setPendingId] = useState<string>('');
  const [venmo, setVenmo] = useState('');
  const [zelle, setZelle] = useState('');
  const [zelleKind, setZelleKind] = useState<ZelleHandleKind>('email');
  const [error, setError] = useState<string | null>(null);

  const sorted = players
    .slice()
    .sort((a, b) => a.nickname.localeCompare(b.nickname));

  // Pre-fill Venmo / Zelle from any existing record for the chosen player.
  useEffect(() => {
    if (pendingId === '' || pendingId === '__spectator') {
      setVenmo('');
      setZelle('');
      setZelleKind('email');
      setError(null);
      return;
    }
    const existing = paymentMethodsByPlayerId?.get(pendingId);
    setVenmo(existing?.venmoUsername ?? '');
    setZelle(existing?.zelleHandle ?? '');
    setZelleKind(existing?.zelleHandleKind ?? 'email');
    setError(null);
  }, [pendingId, paymentMethodsByPlayerId]);

  const handleConfirm = () => {
    if (pendingId === '__spectator') {
      onPick({ player: null, paymentMethods: null });
      return;
    }
    const picked = sorted.find((p) => p.playerId === pendingId);
    if (!picked) return;

    const venmoTrimmed = venmo.trim().replace(/^@+/, '');
    const zelleTrimmed = zelle.trim();
    if (venmoTrimmed && !/^[A-Za-z0-9_-]{1,30}$/.test(venmoTrimmed)) {
      setError('Venmo username must be 1–30 letters, digits, hyphens, or underscores.');
      return;
    }
    if (zelleTrimmed) {
      if (zelleKind === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(zelleTrimmed)) {
        setError('Zelle email looks malformed.');
        return;
      }
      if (zelleKind === 'phone' && !/^[0-9+()\-.\s]{7,}$/.test(zelleTrimmed)) {
        setError('Zelle phone looks malformed.');
        return;
      }
    }

    const hasMethods = venmoTrimmed.length > 0 || zelleTrimmed.length > 0;
    onPick({
      player: { playerId: picked.playerId, nickname: picked.nickname },
      paymentMethods: hasMethods
        ? {
            venmoUsername: venmoTrimmed.length > 0 ? venmoTrimmed : null,
            zelleHandle: zelleTrimmed.length > 0 ? zelleTrimmed : null,
            zelleHandleKind: zelleTrimmed.length > 0 ? zelleKind : null,
          }
        : null,
    });
  };

  const isPlayer =
    pendingId !== '' && pendingId !== '__spectator';

  return (
    <section
      aria-labelledby="identity-heading"
      className="card border-accent/60"
    >
      <div className="card-header bg-accent/[0.08]">
        <span id="identity-heading" className="ticker-label-strong text-accent">
          identify yourself
        </span>
        <span className="ticker-label">audit-log + payment icons</span>
      </div>
      <div className="px-4 py-4 space-y-3">
        <p className="text-[12.5px] text-fg-dim leading-relaxed">
          Pick the player you are at the table. Anyone can mark any payment
          complete — your name flows into the audit history. Optionally
          register your Venmo / Zelle so other players can tap to pay you
          directly from the settlement plan.
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

        {isPlayer && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-line/60">
            <div>
              <label htmlFor="identity-venmo" className="ticker-label block mb-1.5">
                venmo (optional)
              </label>
              <div className="flex items-center gap-1.5">
                <span aria-hidden="true" className="text-fg-mute font-mono select-none">
                  @
                </span>
                <input
                  id="identity-venmo"
                  type="text"
                  value={venmo}
                  onChange={(e) => {
                    setVenmo(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="kev-stmts"
                  className="field flex-1 font-mono text-[13px]"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </div>
            </div>
            <div>
              <label htmlFor="identity-zelle" className="ticker-label block mb-1.5">
                zelle (optional)
              </label>
              <div className="flex items-center gap-1.5">
                <select
                  value={zelleKind}
                  onChange={(e) => setZelleKind(e.target.value as ZelleHandleKind)}
                  className="field font-sans font-semibold text-[13px] pr-7"
                  style={{
                    backgroundImage:
                      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' stroke='%239595a8' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 8px center',
                    appearance: 'none',
                    width: 78,
                  }}
                  aria-label="Zelle handle kind"
                >
                  <option value="email">email</option>
                  <option value="phone">phone</option>
                </select>
                <input
                  id="identity-zelle"
                  type={zelleKind === 'email' ? 'email' : 'tel'}
                  value={zelle}
                  onChange={(e) => {
                    setZelle(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder={
                    zelleKind === 'email' ? 'kev@example.com' : '+1 555 0100'
                  }
                  className="field flex-1 font-mono text-[13px]"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </div>
            </div>
          </div>
        )}

        {error && (
          <p className="text-[12px] text-loss font-semibold flex items-center gap-2" role="alert">
            <span className="pill pill-loss">err</span>
            {error}
          </p>
        )}

        <div className="pt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!pendingId}
            className="btn btn-fill btn-sm"
          >
            continue ›
          </button>
          <span className="ticker-label">stored locally · synced to D1</span>
        </div>
      </div>
    </section>
  );
}
