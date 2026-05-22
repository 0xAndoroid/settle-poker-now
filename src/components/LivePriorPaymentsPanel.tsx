import { useMemo, useState, type FormEvent } from 'react';
import { centsFromDollarsString } from '@/lib/money';
import type { LiveGameSnapshot, LivePlayer } from '@/lib/types';

interface LivePriorPaymentsPanelProps {
  snapshot: LiveGameSnapshot;
  onAddEntry: (body: {
    playerId: string;
    entryType: 'prior_payment';
    amountCents: number;
    toPlayerId: string;
  }) => Promise<void>;
}

export function LivePriorPaymentsPanel({ snapshot, onAddEntry }: LivePriorPaymentsPanelProps) {
  const players = useMemo(() => activePlayers(snapshot), [snapshot]);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canRecord = players.length >= 2;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!fromId || !toId) {
      setError('Pick both players.');
      return;
    }
    if (fromId === toId) {
      setError('From and to must differ.');
      return;
    }
    let amountCents: number;
    try {
      amountCents = centsFromDollarsString(amount);
    } catch {
      setError('Enter a valid amount.');
      return;
    }
    if (amountCents <= 0) {
      setError('Amount must be positive.');
      return;
    }
    setSaving(true);
    try {
      await onAddEntry({
        playerId: fromId,
        entryType: 'prior_payment',
        amountCents,
        toPlayerId: toId,
      });
      setAmount('');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record payment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card" aria-labelledby="live-prior-payments-heading">
      <div className="card-header">
        <span id="live-prior-payments-heading" className="ticker-label-strong">
          prior payments
        </span>
        <span className="ticker-label">adjustments</span>
      </div>

      {!canRecord ? (
        <div className="px-5 py-8 text-center text-[13px] text-fg-dim">
          Add at least two players to record a direct payment.
        </div>
      ) : (
        <form onSubmit={submit} className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <PlayerSelect
              id="live-prior-from"
              label="from"
              value={fromId}
              onChange={setFromId}
              players={players}
            />
            <PlayerSelect
              id="live-prior-to"
              label="to"
              value={toId}
              onChange={setToId}
              players={players}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-2 items-end">
            <label className="block space-y-1.5">
              <span className="ticker-label">amount</span>
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="decimal"
                placeholder="$0.00"
                className="field font-mono num text-[14px]"
              />
            </label>

            <button type="submit" className="btn btn-fill h-11" disabled={saving}>
              {saving ? 'saving...' : 'record'}
            </button>
          </div>

          {error && (
            <p className="text-loss text-[12px] font-semibold" role="alert">
              {error}
            </p>
          )}
        </form>
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
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  players: LivePlayer[];
}) {
  return (
    <label htmlFor={id} className="block space-y-1.5">
      <span className="ticker-label">{label}</span>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field font-sans font-semibold text-[13px] pr-8"
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
