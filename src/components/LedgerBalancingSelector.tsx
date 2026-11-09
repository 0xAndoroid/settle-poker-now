import { useId } from 'react';
import { PlayerSelectField } from './FormControls';
import { balanceFinalLedgerRows, formatImbalanceConfirmation } from '@/lib/ledgerBalancing';
import { formatDollars } from '@/lib/money';
import type { LedgerBalancing, LedgerRow } from '@/lib/types';

interface LedgerBalancingSelectorProps {
  rows: LedgerRow[];
  value: LedgerBalancing;
  onChange: (value: LedgerBalancing) => void | Promise<void>;
  disabled?: boolean;
}

export function LedgerBalancingSelector({
  rows,
  value,
  onChange,
  disabled = false,
}: LedgerBalancingSelectorProps) {
  const id = useId();
  const deltaCents = rows.reduce((sum, row) => sum + row.netCents, 0);
  if (deltaCents === 0) return null;
  const { proportionalAdjustments } = balanceFinalLedgerRows(rows, value);
  return (
    <section className="card" aria-label="Balance ledger discrepancy">
      <div className="card-header">
        <span className="ticker-label-strong">ledger discrepancy</span>
      </div>
      <div className="px-4 py-3 space-y-3">
        <label className="block space-y-1.5" htmlFor={`${id}-method`}>
          <span className="ticker-label">balance by</span>
          <select
            id={`${id}-method`}
            className="field select-field font-sans text-[13px] min-h-11 disabled:opacity-50"
            value={value.method}
            disabled={disabled}
            onChange={(event) => {
              const method = event.target.value;
              if (method === 'player') {
                void onChange({ method, playerId: rows[0]!.playerId });
              } else if (method === 'winnings' || method === 'cashout') {
                void onChange({ method });
              }
            }}
          >
            <option value="winnings">Winnings / losses (before prior payments)</option>
            <option value="cashout">Cash-outs</option>
            <option value="player">One player</option>
          </select>
        </label>
        {value.method === 'player' && (
          <PlayerSelectField
            id={`${id}-player`}
            label="player absorbing the discrepancy"
            value={rows.some((row) => row.playerId === value.playerId) ? value.playerId : ''}
            onChange={(playerId) => {
              if (playerId) void onChange({ method: 'player', playerId });
            }}
            options={rows.map((row) => ({ value: row.playerId, label: row.nickname }))}
            placeholder="Select a player"
            disabled={disabled}
          />
        )}
        <p className="text-[12.5px] text-fg-dim leading-relaxed">
          {formatImbalanceConfirmation(deltaCents, value, rows)}
        </p>
        {proportionalAdjustments.length === 0 ? (
          <p role="alert" className="text-[12.5px] text-loss">
            Choose a player in this ledger or a method with eligible players.
          </p>
        ) : (
          <ul className="text-[13px] divide-y divide-line">
            {proportionalAdjustments.map((adjustment) => (
              <li key={adjustment.playerId} className="flex justify-between gap-3 py-2">
                <span>{rows.find((row) => row.playerId === adjustment.playerId)?.nickname}</span>
                <span className="num">
                  {formatDollars(adjustment.amountCents, { signed: true })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
