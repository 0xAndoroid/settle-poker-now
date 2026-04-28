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
    <section aria-labelledby="adj-heading" className="slab">
      <div className="slab-heading">
        <span id="adj-heading">prior payments</span>
        <span className="text-mute font-normal normal-case tracking-normal text-[10.5px]">
          {adjustments.length} recorded
        </span>
      </div>

      <form onSubmit={handleSubmit} className="px-5 py-5 border-b border-hairline bg-paper-2 space-y-4">
        <p className="text-[12px] leading-relaxed text-ink-2">
          Record cash that already changed hands. The plan recomputes
          automatically.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-end">
          <FieldSelect
            id="adj-from"
            label="from"
            value={fromId}
            onChange={setFromId}
            balances={sortedBalances}
          />
          <span aria-hidden="true" className="hidden sm:block text-center text-mute pb-2">→</span>
          <FieldSelect
            id="adj-to"
            label="to"
            value={toId}
            onChange={setToId}
            balances={sortedBalances}
          />
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <label htmlFor="adj-amount" className="block text-[10px] uppercase tracking-masthead font-bold mb-1">
              amount
            </label>
            <div className="flex items-baseline gap-2">
              <span aria-hidden="true" className="font-mono font-bold text-ink/60 select-none">$</span>
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
                className="field flex-1 font-mono text-[14px]"
                aria-label="Amount in dollars"
              />
            </div>
          </div>
          <button type="submit" className="btn btn-fill">
            record ›
          </button>
        </div>
        {error && (
          <p className="text-[12px] uppercase tracking-all font-bold text-loss" role="alert">
            ⚠ {error}
          </p>
        )}
      </form>

      {adjustments.length > 0 ? (
        <ul role="list" className="font-mono">
          {adjustments.map((adj, idx) => (
            <li
              key={adj.id}
              className="px-5 py-3 flex items-center gap-3 border-t border-hairline first:border-t-0"
            >
              <span className="text-mute text-[11px] tabular-nums w-5 flex-shrink-0">
                {String(idx + 1).padStart(2, '0')}
              </span>
              <div className="flex-1 min-w-0 text-[13px]">
                <span className="font-bold">{nameById.get(adj.fromId) ?? adj.fromId}</span>
                <span aria-hidden="true" className="text-mute mx-2">→</span>
                <span className="font-bold">{nameById.get(adj.toId) ?? adj.toId}</span>
                <span className="text-mute mx-2">·</span>
                <span className="font-extrabold tabular-nums">{formatDollars(adj.amountCents)}</span>
              </div>
              <button
                type="button"
                onClick={() => onRemove(adj.id)}
                className="btn btn-ghost btn-sm"
                aria-label="Remove this payment record"
              >
                ✕ remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-5 py-4 text-center text-[11.5px] text-mute uppercase tracking-all">
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
      <label htmlFor={id} className="block text-[10px] uppercase tracking-masthead font-bold mb-1">
        {label}
      </label>
      <select
        id={id}
        name={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field font-mono font-bold text-[14px]"
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
