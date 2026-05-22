import { useMemo, useState, type FormEvent } from 'react';
import { centsFromDollarsString, formatDollars } from '@/lib/money';
import type { LivePlayerSummary } from '@/lib/types';

export type LiveEntryMode = 'buy_in' | 'cash_out';

interface LiveEntrySheetProps {
  mode: LiveEntryMode;
  player: LivePlayerSummary;
  recentAmounts: number[];
  onCancel: () => void;
  onSubmit: (args: {
    amountCents: number;
    isFinal: boolean;
  }) => Promise<void>;
}

export function LiveEntrySheet({
  mode,
  player,
  recentAmounts,
  onCancel,
  onSubmit,
}: LiveEntrySheetProps) {
  const [amount, setAmount] = useState('');
  const [isFinal, setIsFinal] = useState(mode !== 'buy_in');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = mode === 'buy_in' ? 'buy-in' : 'cashout';
  const chips = useMemo(() => {
    const defaults = [2_000, 4_000, 10_000];
    return Array.from(new Set([...recentAmounts, ...defaults]))
      .filter((value) => value > 0)
      .slice(0, 5);
  }, [recentAmounts]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    let amountCents: number;
    try {
      amountCents = centsFromDollarsString(amount);
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    if (mode === 'cash_out' ? amountCents < 0 : amountCents <= 0) {
      setError(mode === 'cash_out' ? 'Amount cannot be negative.' : 'Amount is required.');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        amountCents,
        isFinal,
      });
      onCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save entry.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-t border-line bg-surface-2 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="ticker-label-strong">{label}</p>
          <p className="text-[12px] text-fg-dim">{player.name}</p>
        </div>
      </div>

      <label className="block space-y-1.5">
        <span className="ticker-label">amount</span>
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          inputMode="decimal"
          placeholder="$0.00"
          className="field font-mono num text-[16px]"
          autoFocus
        />
      </label>

      <div className="flex flex-wrap gap-2">
        {chips.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setAmount(formatDollars(value, { symbol: false }))}
            className="btn btn-sm min-h-[40px]"
          >
            {formatDollars(value, { fixedDecimals: false })}
          </button>
        ))}
      </div>

      {mode === 'cash_out' && (
        <label className="flex items-center gap-2 text-[13px] text-fg-dim">
          <input
            type="checkbox"
            checked={isFinal}
            onChange={(event) => setIsFinal(event.target.checked)}
            className="checkbox-poker"
          />
          final cashout
        </label>
      )}

      {error && (
        <p className="text-loss text-[12px] font-semibold" role="alert">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onCancel} className="btn h-11" disabled={saving}>
          cancel
        </button>
        <button type="submit" className="btn btn-fill h-11" disabled={saving}>
          {saving ? 'saving...' : 'save'}
        </button>
      </div>
    </form>
  );
}
