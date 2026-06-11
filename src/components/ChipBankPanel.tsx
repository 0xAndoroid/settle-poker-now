import { useEffect, useState, type FormEvent } from 'react';
import { FormError } from './FormControls';
import { errorMessage } from '@/lib/errors';
import { centsFromDollarsString, formatDollars } from '@/lib/money';
import type { LiveChipCheckpointType, LiveGameSnapshot } from '@/lib/types';

interface ChipBankPanelProps {
  snapshot: LiveGameSnapshot;
  onAddCheckpoint: (body: {
    checkpointType: LiveChipCheckpointType;
    amountCents: number;
    note?: string | null;
  }) => Promise<void>;
}

export function ChipBankPanel({ snapshot, onAddCheckpoint }: ChipBankPanelProps) {
  const bank = snapshot.bankSummary;
  const [mode, setMode] = useState<LiveChipCheckpointType>('verify_table_count');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canVerifyBankCount = bank.totalChipBankCents !== null;

  useEffect(() => {
    if (!canVerifyBankCount && mode === 'verify_bank_count') {
      setMode('verify_table_count');
    }
  }, [canVerifyBankCount, mode]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    let cents: number;
    try {
      cents = centsFromDollarsString(amount);
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    if (cents < 0) {
      setError('Amount cannot be negative.');
      return;
    }
    setSaving(true);
    try {
      await onAddCheckpoint({ checkpointType: mode, amountCents: cents });
      setAmount('');
    } catch (err) {
      setError(errorMessage(err, 'Could not record count.'));
    } finally {
      setSaving(false);
    }
  };

  const tableMismatch = bank.latestTableDeltaCents !== null && bank.latestTableDeltaCents !== 0;
  const bankMismatch = bank.latestBankDeltaCents !== null && bank.latestBankDeltaCents !== 0;

  return (
    <section className="card" aria-labelledby="chip-bank-heading">
      <div className="card-header">
        <span id="chip-bank-heading" className="ticker-label-strong">
          chip bank
        </span>
        {(tableMismatch || bankMismatch) && <span className="pill pill-loss">off</span>}
      </div>

      <div className="p-4 grid grid-cols-2 gap-3 border-b border-line">
        <BankMetric label="total bank" value={moneyOrDash(bank.totalChipBankCents)} />
        <BankMetric label="chips in play" value={formatDollars(bank.chipsInPlayCents)} />
        <BankMetric label="expected tray" value={moneyOrDash(bank.expectedBankOnHandCents)} />
        <BankMetric
          label="table delta"
          value={deltaOrDash(bank.latestTableDeltaCents)}
          warn={tableMismatch}
        />
        <BankMetric
          label="bank delta"
          value={deltaOrDash(bank.latestBankDeltaCents)}
          warn={bankMismatch}
        />
      </div>

      {snapshot.chipCheckpoints.length === 0 && (
        <div className="border-b border-line bg-fill-1 px-4 py-3 text-[12.5px] leading-relaxed text-fg-dim">
          Set total to record the full chip bank. Use table count to compare physical chips on the
          table against tracked buy-ins and cashouts. After a total is set, bank count checks the
          tray against the expected remainder.
        </div>
      )}

      {(tableMismatch || bankMismatch) && (
        <div className="border-b border-line bg-loss/5 px-4 py-3 text-[12.5px] text-fg-dim leading-relaxed">
          {tableMismatch && (
            <p>
              Tracked chips in play: {formatDollars(bank.chipsInPlayCents)}. Physical table count:{' '}
              {moneyOrDash(bank.latestTableCountCents)}. Off by{' '}
              {deltaOrDash(bank.latestTableDeltaCents)}.
            </p>
          )}
          {bankMismatch && (
            <p>
              Expected bank on hand: {moneyOrDash(bank.expectedBankOnHandCents)}. Physical bank
              count: {moneyOrDash(bank.latestBankCountCents)}. Off by{' '}
              {deltaOrDash(bank.latestBankDeltaCents)}.
            </p>
          )}
        </div>
      )}

      <form onSubmit={submit} className="p-4 space-y-3">
        <div className={canVerifyBankCount ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-2 gap-2'}>
          <ModeButton
            active={mode === 'set_bank_total'}
            label="set total"
            onClick={() => setMode('set_bank_total')}
          />
          <ModeButton
            active={mode === 'verify_table_count'}
            label="table count"
            onClick={() => setMode('verify_table_count')}
          />
          {canVerifyBankCount && (
            <ModeButton
              active={mode === 'verify_bank_count'}
              label="bank count"
              onClick={() => setMode('verify_bank_count')}
            />
          )}
        </div>
        <div className="flex gap-2">
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="$0.00"
            inputMode="decimal"
            className="field num"
          />
          <button type="submit" className="btn btn-fill h-11" disabled={saving}>
            record
          </button>
        </div>
        {error && <FormError>{error}</FormError>}
      </form>
    </section>
  );
}

function BankMetric({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="border border-line bg-fill-1 p-3">
      <div className="ticker-label mb-1">{label}</div>
      <div className={warn ? 'num font-bold text-loss' : 'num font-bold'}>
        {value}
      </div>
    </div>
  );
}

function ModeButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active ? 'btn btn-fill btn-sm min-h-[44px]' : 'btn btn-sm min-h-[44px]'}
    >
      {label}
    </button>
  );
}

function moneyOrDash(value: number | null): string {
  return value === null ? '--' : formatDollars(value);
}

function deltaOrDash(value: number | null): string {
  return value === null ? '--' : formatDollars(value, { signed: true });
}
