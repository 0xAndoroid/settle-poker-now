import { useState, type FormEvent } from 'react';
import { FormError, PlayerSelectField } from './FormControls';
import { centsFromDollarsString, formatDollars } from '@/lib/money';
import { newId } from '@/lib/id';
import type { Adjustment, EffectiveBalance } from '@/lib/types';

interface AdjustmentsPanelProps {
  balances: EffectiveBalance[];
  adjustments: Adjustment[];
  onAdd: (adj: Adjustment) => void;
  onRemove: (id: string) => void;
}

export function AdjustmentsPanel({
  balances,
  adjustments,
  onAdd,
  onRemove,
}: AdjustmentsPanelProps) {
  const sortedBalances = balances
    .slice()
    .sort((a, b) => a.nickname.localeCompare(b.nickname));

  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const nameById = new Map(balances.map((b) => [b.playerId, b.nickname]));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!fromId || !toId) {
      setError('Pick both players.');
      return;
    }
    if (fromId === toId) {
      setError('From and to must differ.');
      return;
    }
    let cents: number;
    try {
      cents = centsFromDollarsString(amount);
    } catch {
      setError('Enter a valid amount.');
      return;
    }
    if (cents <= 0) {
      setError('Amount must be positive.');
      return;
    }
    onAdd({ id: newId('adj-'), fromId, toId, amountCents: cents });
    setAmount('');
    setError(null);
  };

  return (
    <section aria-labelledby="adj-heading" className="card kc-green">
      <div className="card-header">
        <span id="adj-heading" className="ticker-label-strong">
          prior payments
        </span>
        <span className="ticker-label">{adjustments.length} recorded</span>
      </div>

      <form onSubmit={handleSubmit} className="px-4 py-4 border-b border-line bg-fill-1 space-y-3">
        <p className="text-[12.5px] leading-relaxed text-fg-dim">
          Record cash that already changed hands. The plan recomputes
          automatically.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2 items-end">
          <PlayerSelectField
            id="adj-from"
            label="from"
            value={fromId}
            onChange={setFromId}
            options={sortedBalances.map((balance) => ({
              value: balance.playerId,
              label: balance.nickname,
            }))}
            placeholder="— pick from —"
            selectClassName="field font-sans font-semibold text-[14px] pr-8"
          />
          <span aria-hidden="true" className="hidden sm:flex items-end pb-2.5 justify-center text-fg-mute">→</span>
          <PlayerSelectField
            id="adj-to"
            label="to"
            value={toId}
            onChange={setToId}
            options={sortedBalances.map((balance) => ({
              value: balance.playerId,
              label: balance.nickname,
            }))}
            placeholder="— pick to —"
            selectClassName="field font-sans font-semibold text-[14px] pr-8"
          />
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
          <div>
            <label htmlFor="adj-amount" className="ticker-label block mb-1.5">
              amount usd
            </label>
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="text-fg-mute select-none">$</span>
              <input
                id="adj-amount"
                name="adj-amount"
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="40.00"
                className="field flex-1 num text-[14px]"
                aria-label="Amount in dollars"
              />
            </div>
          </div>
          <button type="submit" className="btn btn-fill">
            record ›
          </button>
        </div>

        {error && <FormError>{error}</FormError>}
      </form>

      {adjustments.length > 0 ? (
        <ul role="list">
          {adjustments.map((adj, idx) => (
            <li
              key={adj.id}
              className="px-4 py-2.5 flex items-center gap-3 border-b border-line last:border-b-0 text-[13px]"
            >
              <span className="num text-fg-mute text-[11px] w-6 flex-shrink-0">
                {String(idx + 1).padStart(2, '0')}
              </span>
              <div className="flex-1 min-w-0 flex items-center gap-2 font-sans">
                <span className="font-semibold text-fg truncate">
                  {nameById.get(adj.fromId) ?? adj.fromId}
                </span>
                <span aria-hidden="true" className="text-fg-mute shrink-0">→</span>
                <span className="font-semibold text-fg truncate">
                  {nameById.get(adj.toId) ?? adj.toId}
                </span>
              </div>
              <span className="num font-bold text-fg flex-shrink-0">
                {formatDollars(adj.amountCents)}
              </span>
              <button
                type="button"
                onClick={() => onRemove(adj.id)}
                className="btn btn-ghost btn-sm"
                aria-label="Remove this payment record"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-4 py-3 text-center text-[11px] text-fg-mute uppercase tracking-ticker">
          — no payments recorded —
        </div>
      )}
    </section>
  );
}
