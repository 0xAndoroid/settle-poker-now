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

  const [fromId, setFromId] = useState<string>('');
  const [toId, setToId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const nameById = new Map(balances.map((b) => [b.playerId, b.nickname]));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!fromId || !toId) {
      setError('Pick both players.');
      return;
    }
    if (fromId === toId) {
      setError('From and to must be different.');
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
    <section
      aria-labelledby="adjustments-heading"
      className="surface rounded-2xl overflow-hidden"
    >
      <header className="px-5 py-4 border-b border-[var(--border)]">
        <h2 id="adjustments-heading" className="text-[15px] font-semibold tracking-tight">
          Already paid
        </h2>
        <p className="text-xs text-[var(--fg-dim)] mt-0.5">
          Record cash that already changed hands. The plan recomputes automatically.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 border-b border-[var(--border)]">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-center">
          <PlayerSelect
            value={fromId}
            onChange={setFromId}
            balances={sortedBalances}
            label="From"
          />
          <div
            className="hidden sm:flex items-center justify-center text-[var(--fg-mute)]"
            aria-hidden="true"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </div>
          <PlayerSelect
            value={toId}
            onChange={setToId}
            balances={sortedBalances}
            label="To"
          />
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span
              aria-hidden="true"
              className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--fg-mute)] text-sm font-mono"
            >
              $
            </span>
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
              className="input-field pl-8 font-mono"
              aria-label="Amount in dollars"
            />
          </div>
          <button type="submit" className="btn-primary px-4 sm:px-5">
            Add
          </button>
        </div>
        {error && (
          <p className="text-sm text-loss animate-fade-in" role="alert">
            {error}
          </p>
        )}
      </form>

      {adjustments.length > 0 ? (
        <ul role="list" className="divide-y divide-[var(--border)]">
          {adjustments.map((adj) => (
            <li
              key={adj.id}
              className="px-5 py-3 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2 font-mono text-[13px] min-w-0">
                <span className="font-medium truncate">
                  {nameById.get(adj.fromId) ?? adj.fromId}
                </span>
                <span className="text-[var(--fg-mute)]" aria-hidden="true">
                  →
                </span>
                <span className="font-medium truncate">
                  {nameById.get(adj.toId) ?? adj.toId}
                </span>
                <span className="text-[var(--fg-dim)]">·</span>
                <span className="tabular-nums">{formatDollars(adj.amountCents)}</span>
              </div>
              <button
                type="button"
                onClick={() => onRemove(adj.id)}
                className="btn-ghost px-2"
                aria-label="Remove this adjustment"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-5 py-4 text-xs text-[var(--fg-mute)] text-center">
          No payments recorded yet.
        </div>
      )}
    </section>
  );
}

interface PlayerSelectProps {
  value: string;
  onChange: (v: string) => void;
  balances: EffectiveBalance[];
  label: string;
}

function PlayerSelect({ value, onChange, balances, label }: PlayerSelectProps) {
  const id = `adj-${label.toLowerCase()}`;
  return (
    <label className="block" htmlFor={id}>
      <span className="sr-only">{label}</span>
      <select
        id={id}
        name={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-field appearance-none pr-9 bg-[image:url('data:image/svg+xml;utf8,<svg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%238d97ab%22><path%20d%3D%22M5.293%207.293a1%201%200%20011.414%200L10%2010.586l3.293-3.293a1%201%200%20111.414%201.414l-4%204a1%201%200%2001-1.414%200l-4-4a1%201%200%20010-1.414z%22%20clip-rule%3D%22evenodd%22%20fill-rule%3D%22evenodd%22%2F><%2Fsvg>')] bg-no-repeat bg-[right_0.75rem_center] bg-[length:18px_18px]"
      >
        <option value="">{label}…</option>
        {balances.map((b) => (
          <option key={b.playerId} value={b.playerId}>
            {b.nickname}
          </option>
        ))}
      </select>
    </label>
  );
}
