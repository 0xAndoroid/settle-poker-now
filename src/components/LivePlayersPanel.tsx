import { useMemo, useState, type FormEvent } from 'react';
import { LiveEntrySheet, type LiveEntryMode } from './LiveEntrySheet';
import { formatDollars, formatNet } from '@/lib/money';
import type { LiveEntry, LiveGameSnapshot, LivePlayerStatus } from '@/lib/types';

interface LivePlayersPanelProps {
  snapshot: LiveGameSnapshot;
  onAddPlayer: (name: string, isHost?: boolean) => Promise<void>;
  onUpdatePlayer: (
    playerId: string,
    patch: { name?: string; status?: LivePlayerStatus; isHost?: boolean }
  ) => Promise<void>;
  onAddEntry: (body: {
    playerId: string;
    entryType: 'buy_in' | 'cash_out';
    amountCents: number;
    isFinal?: boolean;
  }) => Promise<void>;
  onVoidEntry: (entryId: string, reason?: string | null) => Promise<void>;
}

export function LivePlayersPanel({
  snapshot,
  onAddPlayer,
  onUpdatePlayer,
  onAddEntry,
  onVoidEntry,
}: LivePlayersPanelProps) {
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [sheet, setSheet] = useState<{
    mode: LiveEntryMode;
    playerId: string;
  } | null>(null);

  const host = snapshot.players.find((player) => player.playerId === snapshot.game.hostPlayerId);
  const recentAmounts = useMemo(() => {
    return snapshot.entries
      .filter((entry) => entry.voidedAt === null && entry.amountCents > 0)
      .slice(-6)
      .map((entry) => entry.amountCents)
      .reverse();
  }, [snapshot.entries]);

  const addPlayer = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setAdding(true);
    try {
      await onAddPlayer(trimmed, snapshot.players.length === 0);
      setName('');
    } finally {
      setAdding(false);
    }
  };

  return (
    <section className="card" aria-labelledby="live-players-heading">
      <div className="card-header">
        <span id="live-players-heading" className="ticker-label-strong">
          players
          <span className="text-fg-mute font-normal ml-2">· {snapshot.playerSummaries.length}</span>
        </span>
        {host && <span className="pill pill-accent">host · {host.name}</span>}
      </div>

      <form onSubmit={addPlayer} className="border-b border-line p-4 flex gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="add player"
          className="field font-mono text-[14px]"
          autoComplete="off"
        />
        <button type="submit" className="btn btn-fill h-11" disabled={adding || !name.trim()}>
          add
        </button>
      </form>

      <div>
        {snapshot.playerSummaries.length === 0 ? (
          <div className="px-5 py-8 text-center text-[13px] text-fg-dim">
            Add players as they sit down.
          </div>
        ) : (
          snapshot.playerSummaries.map((summary) => {
            const player = snapshot.players.find((p) => p.playerId === summary.playerId);
            if (!player) return null;
            const lastEntry = findLastEntry(snapshot.entries, summary.playerId);
            const hasFinalCashout = summary.hasFinalCashout;
            return (
              <div key={summary.playerId} className="border-b border-line last:border-b-0">
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[16px] font-semibold leading-tight">{summary.name}</h3>
                        {summary.isHost && <span className="pill pill-accent">host</span>}
                        <span className="pill">{summary.status}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-3 text-[12px]">
                        <Metric label="in" value={formatDollars(summary.buyInCents)} />
                        <Metric label="out" value={formatDollars(summary.cashOutCents)} />
                        <Metric label="net" value={formatNet(summary.netCents)} />
                      </div>
                      {(summary.priorPaymentCents > 0 || summary.priorReceivedCents > 0) && (
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-fg-dim">
                          {summary.priorPaymentCents > 0 && (
                            <span className="pill">
                              paid {formatDollars(summary.priorPaymentCents)}
                            </span>
                          )}
                          {summary.priorReceivedCents > 0 && (
                            <span className="pill">
                              received {formatDollars(summary.priorReceivedCents)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm min-h-[36px]"
                      onClick={() => {
                        const next = window.prompt('Rename player', summary.name);
                        if (next) void onUpdatePlayer(summary.playerId, { name: next });
                      }}
                    >
                      rename
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <ActionButton
                      label="buy-in"
                      onClick={() => setSheet({ mode: 'buy_in', playerId: summary.playerId })}
                    />
                    <ActionButton
                      label="cashout"
                      disabled={hasFinalCashout}
                      onClick={() => setSheet({ mode: 'cash_out', playerId: summary.playerId })}
                    />
                    <ActionButton
                      label="host"
                      disabled={summary.isHost}
                      onClick={() => void onUpdatePlayer(summary.playerId, { isHost: true })}
                    />
                    <ActionButton
                      label="void last"
                      disabled={!lastEntry}
                      onClick={() =>
                        lastEntry && void onVoidEntry(lastEntry.id, 'voided from player panel')
                      }
                    />
                  </div>
                </div>

                {sheet?.playerId === summary.playerId && (
                  <LiveEntrySheet
                    mode={sheet.mode}
                    player={summary}
                    recentAmounts={recentAmounts}
                    onCancel={() => setSheet(null)}
                    onSubmit={async ({ amountCents, isFinal }) => {
                      await onAddEntry({
                        playerId: summary.playerId,
                        entryType: sheet.mode,
                        amountCents,
                        isFinal,
                      });
                    }}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="ticker-label">{label}</div>
      <div className="font-mono num font-semibold text-fg">{value}</div>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="btn btn-sm min-h-[44px] px-2"
    >
      {label}
    </button>
  );
}

function findLastEntry(entries: ReadonlyArray<LiveEntry>, playerId: string): LiveEntry | null {
  return (
    entries
      .filter((entry) => entry.playerId === playerId && entry.voidedAt === null)
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
  );
}
