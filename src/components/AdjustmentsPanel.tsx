import { useState, type FormEvent } from 'react';
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
    <section aria-labelledby="adj-heading" className="card">
      <div className="card-header">
        <span id="adj-heading" className="ticker-label-strong">
          prior payments
        </span>
        <span className="ticker-label">{adjustments.length} recorded</span>
      </div>

      <form onSubmit={handleSubmit} className="px-4 py-4 border-b border-line bg-surface-2 space-y-3">
        <p className="text-[12.5px] leading-relaxed text-fg-dim">
          Record cash that already changed hands. The plan recomputes
          automatically.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2 items-end">
          <FieldSelect
            id="adj-from"
            label="from"
            value={fromId}
            onChange={setFromId}
            balances={sortedBalances}
          />
          <span aria-hidden="true" className="hidden sm:flex items-end pb-2.5 justify-center text-fg-mute font-mono">↦</span>
          <FieldSelect
            id="adj-to"
            label="to"
            value={toId}
            onChange={setToId}
            balances={sortedBalances}
          />
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
          <div>
            <label htmlFor="adj-amount" className="ticker-label block mb-1.5">
              amount usd
            </label>
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="text-fg-mute font-mono select-none">$</span>
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
                className="field flex-1 font-mono num text-[14px]"
                aria-label="Amount in dollars"
              />
            </div>
          </div>
          <button type="submit" className="btn btn-fill">
            record ›
          </button>
        </div>

        {error && (
          <p className="text-[12px] text-loss font-semibold flex items-center gap-2" role="alert">
            <span className="pill pill-loss">err</span>
            {error}
          </p>
        )}
      </form>

      {adjustments.length > 0 ? (
        <ul role="list">
          {adjustments.map((adj, idx) => (
            <li
              key={adj.id}
              className="px-4 py-2.5 flex items-center gap-3 border-b border-line/60 last:border-b-0 text-[13px]"
            >
              <span className="font-mono num text-fg-mute text-[11px] w-6 flex-shrink-0">
                {String(idx + 1).padStart(2, '0')}
              </span>
              <div className="flex-1 min-w-0 flex items-center gap-2 font-sans">
                <span className="font-semibold text-fg truncate">
                  {nameById.get(adj.fromId) ?? adj.fromId}
                </span>
                <span aria-hidden="true" className="text-fg-mute font-mono shrink-0">↦</span>
                <span className="font-semibold text-fg truncate">
                  {nameById.get(adj.toId) ?? adj.toId}
                </span>
              </div>
              <span className="font-mono num font-bold text-fg flex-shrink-0">
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

interface FieldSelectProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  balances: EffectiveBalance[];
}

function FieldSelect({ id, label, value, onChange, balances }: FieldSelectProps) {
  return (
    <div>
      <label htmlFor={id} className="ticker-label block mb-1.5">
        {label}
      </label>
      <select
        id={id}
        name={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field font-sans font-semibold text-[14px] pr-8"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' stroke='%239595a8' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 12px center',
          appearance: 'none',
        }}
      >
        <option value="">— pick {label} —</option>
        {balances.map((b) => (
          <option key={b.playerId} value={b.playerId}>
            {b.nickname}
          </option>
        ))}
      </select>
    </div>
  );
}
