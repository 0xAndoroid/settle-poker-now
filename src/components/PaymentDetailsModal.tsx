import { useEffect, useRef, useState } from 'react';
import { FormError } from './FormControls';
import type { PersistedPaymentMethod, PersistedPlayer } from '@/lib/types';
import { cn } from '@/lib/cn';

export interface PaymentDetailsResult {
  player: { playerId: string; nickname: string };
  /** Without leading '@'. `null` clears the handle. */
  venmoUsername: string | null;
  zelleHandle: string | null;
}

interface PaymentDetailsModalProps {
  players: ReadonlyArray<PersistedPlayer>;
  /**
   * Existing payment methods on file (pre-fills the form when a player is
   * picked). The Map identity changes on every poll tick of the parent —
   * we ref-pin it so the pre-fill effect only fires when the picked player
   * changes (otherwise an 8s poll resets the Venmo / Zelle inputs
   * mid-typing).
   */
  paymentMethodsByPlayerId: ReadonlyMap<string, PersistedPaymentMethod>;
  /** Current identity, if any — pre-selects the roster chip. */
  initialPlayerId: string | null;
  onCancel: () => void;
  onSave: (result: PaymentDetailsResult) => void;
}

/**
 * "Get paid" modal — the user picks who they are at the table and
 * registers Venmo / Zelle handles so settlement rows targeting them can
 * surface tap-to-pay deep links. Picking a name doubles as identifying
 * yourself for the audit log and "your payments" highlighting; there is
 * no separate identity step.
 *
 * Form-state policy mirrors the old identity prompt: inputs are plain
 * `useState`, values flow upward only on save, so parent re-renders from
 * the game poll can't clobber in-flight typing.
 */
export function PaymentDetailsModal({
  players,
  paymentMethodsByPlayerId,
  initialPlayerId,
  onCancel,
  onSave,
}: PaymentDetailsModalProps) {
  const [pendingId, setPendingId] = useState<string>(initialPlayerId ?? '');
  const [venmo, setVenmo] = useState('');
  const [zelle, setZelle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const paymentMethodsRef = useRef(paymentMethodsByPlayerId);
  paymentMethodsRef.current = paymentMethodsByPlayerId;

  const sorted = players.slice().sort((a, b) => a.nickname.localeCompare(b.nickname));

  // Pre-fill Venmo / Zelle from any existing record for the chosen player.
  // Reads through the ref so a parent poll tick doesn't reset typing.
  useEffect(() => {
    if (pendingId === '') {
      setVenmo('');
      setZelle('');
      setError(null);
      return;
    }
    const existing = paymentMethodsRef.current.get(pendingId);
    setVenmo(existing?.venmoUsername ?? '');
    setZelle(existing?.zelleHandle ?? '');
    setError(null);
  }, [pendingId]);

  const handleSave = () => {
    const picked = sorted.find((p) => p.playerId === pendingId);
    if (!picked) return;

    const venmoTrimmed = venmo.trim().replace(/^@+/, '');
    const zelleTrimmed = zelle.trim();
    if (venmoTrimmed && !/^[A-Za-z0-9_-]{1,30}$/.test(venmoTrimmed)) {
      setError('Venmo username must be 1–30 letters, digits, hyphens, or underscores.');
      return;
    }
    if (zelleTrimmed.length > 128) {
      setError('Zelle handle is too long.');
      return;
    }

    onSave({
      player: { playerId: picked.playerId, nickname: picked.nickname },
      venmoUsername: venmoTrimmed.length > 0 ? venmoTrimmed : null,
      zelleHandle: zelleTrimmed.length > 0 ? zelleTrimmed : null,
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center px-4 py-6 sm:py-8 overflow-y-auto">
      <button
        type="button"
        aria-label="Cancel"
        className="veil-in fixed inset-0 cursor-default bg-bg/60 backdrop-blur-md"
        onClick={onCancel}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-details-title"
        className="card pop-in relative z-[61] w-full max-w-md"
      >
        <div className="card-header bg-accent/[0.08]">
          <span id="payment-details-title" className="ticker-label-strong text-accent">
            get paid
          </span>
          <span className="ticker-label">venmo · zelle</span>
        </div>

        <div className="px-4 py-4 space-y-4">
          <div className="space-y-2">
            <p className="ticker-label">i am</p>
            <div className="flex flex-wrap gap-2">
              {sorted.map((p) => {
                const active = pendingId === p.playerId;
                return (
                  <button
                    key={p.playerId}
                    type="button"
                    onClick={() => setPendingId(p.playerId)}
                    className={cn(
                      'min-h-[44px] px-4 font-sans text-[14px] font-semibold border rounded-full',
                      'transition-[background-color,border-color,color,scale] duration-200 active:scale-[0.96]',
                      active
                        ? 'border-transparent bg-accent text-[#0c1018]'
                        : 'border-line-strong bg-fill-1 text-fg-dim hover:text-fg hover:border-accent/50'
                    )}
                  >
                    {p.nickname}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            className={cn(
              'space-y-3 pt-3 border-t border-line',
              pendingId === '' && 'opacity-40 pointer-events-none'
            )}
          >
            <div>
              <label htmlFor="payment-details-venmo" className="ticker-label block mb-1.5">
                venmo (optional)
              </label>
              <div className="flex items-center gap-1.5">
                <span aria-hidden="true" className="text-fg-mute font-mono select-none">
                  @
                </span>
                <input
                  id="payment-details-venmo"
                  type="text"
                  value={venmo}
                  onChange={(e) => {
                    setVenmo(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="kev-stmts"
                  disabled={pendingId === ''}
                  className="field flex-1 font-mono text-[16px]"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </div>
            </div>
            <div>
              <label htmlFor="payment-details-zelle" className="ticker-label block mb-1.5">
                zelle (email or phone, optional)
              </label>
              <input
                id="payment-details-zelle"
                type="text"
                value={zelle}
                onChange={(e) => {
                  setZelle(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="kev@example.com or +1 555 0100"
                disabled={pendingId === ''}
                className="field w-full font-mono text-[16px]"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
              />
            </div>
            <p className="text-[12px] text-fg-mute leading-relaxed">
              Other players get a tap-to-pay link on payments owed to you. Leave both empty to just
              set who you are.
            </p>
          </div>

          {error && <FormError>{error}</FormError>}
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-line p-4">
          <button type="button" className="btn h-11" onClick={onCancel}>
            cancel
          </button>
          <button
            type="button"
            className="btn btn-fill h-11"
            disabled={pendingId === ''}
            onClick={handleSave}
          >
            save
          </button>
        </div>
      </section>
    </div>
  );
}
