import { useMemo, useState, type FormEvent } from 'react';
import { EmptyPanelMessage, FormError, PlayerSelectField } from './FormControls';
import { errorMessage } from '@/lib/errors';
import { centsFromDollarsString } from '@/lib/money';
import { activeLivePlayers } from '@/lib/livePlayers';
import type { LiveGameSnapshot } from '@/lib/types';

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
  const players = useMemo(() => activeLivePlayers(snapshot), [snapshot]);
  const playerOptions = useMemo(
    () => players.map((player) => ({ value: player.playerId, label: player.name })),
    [players]
  );
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
      setFromId('');
      setToId('');
      setAmount('');
      setError(null);
    } catch (err) {
      setError(errorMessage(err, 'Could not record payment.'));
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
        <EmptyPanelMessage>Add at least two players to record a direct payment.</EmptyPanelMessage>
      ) : (
        <form onSubmit={submit} className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <PlayerSelectField
              id="live-prior-from"
              label="from"
              value={fromId}
              onChange={setFromId}
              options={playerOptions}
              placeholder="pick from"
            />
            <PlayerSelectField
              id="live-prior-to"
              label="to"
              value={toId}
              onChange={setToId}
              options={playerOptions}
              placeholder="pick to"
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

          {error && <FormError>{error}</FormError>}
        </form>
      )}
    </section>
  );
}
