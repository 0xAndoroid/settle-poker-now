import { useMemo, useState, type FormEvent } from 'react';
import { EmptyPanelMessage, FormError } from './FormControls';
import { LiveEntrySheet, type LiveEntryMode } from './LiveEntrySheet';
import { errorMessage } from '@/lib/errors';
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
  const [nameError, setNameError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [rename, setRename] = useState<{ playerId: string; name: string } | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [sheet, setSheet] = useState<{
    mode: LiveEntryMode;
    playerId: string;
  } | null>(null);

  const host = snapshot.players.find((player) => player.playerId === snapshot.game.hostPlayerId);
  const duplicateName = name.trim().length > 0 && hasExistingPlayerName(snapshot, name);
  const addPlayerError = duplicateName ? 'player already exists' : nameError;
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
    if (duplicateName) {
      setNameError('player already exists');
      return;
    }
    setNameError(null);
    setAdding(true);
    try {
      await onAddPlayer(trimmed, snapshot.players.length === 0);
      setName('');
    } catch (err) {
      setNameError(errorMessage(err, 'Could not add player.'));
    } finally {
      setAdding(false);
    }
  };

  const submitRename = async (event: FormEvent, playerId: string) => {
    event.preventDefault();
    if (!rename || rename.playerId !== playerId) return;
    const trimmed = rename.name.trim();
    if (!trimmed) {
      setRenameError('name is required');
      return;
    }
    if (hasExistingPlayerName(snapshot, trimmed, playerId)) {
      setRenameError('player already exists');
      return;
    }
    setRenameError(null);
    setRenaming(true);
    try {
      await onUpdatePlayer(playerId, { name: trimmed });
      setRename(null);
    } catch (err) {
      setRenameError(errorMessage(err, 'Could not rename player.'));
    } finally {
      setRenaming(false);
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
        <div className="flex-1 space-y-2">
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (nameError) setNameError(null);
            }}
            placeholder="add player"
            className="field font-mono text-[14px]"
            autoComplete="off"
            aria-invalid={addPlayerError ? 'true' : 'false'}
          />
          {addPlayerError && <FormError>{addPlayerError}</FormError>}
        </div>
        <button
          type="submit"
          className="btn btn-fill h-11"
          disabled={adding || !name.trim() || duplicateName}
        >
          add
        </button>
      </form>

      <div>
        {snapshot.playerSummaries.length === 0 ? (
          <EmptyPanelMessage>Add players as they sit down.</EmptyPanelMessage>
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
                    {rename?.playerId === summary.playerId ? (
                      <form
                        onSubmit={(event) => void submitRename(event, summary.playerId)}
                        className="min-w-[180px] space-y-2"
                      >
                        <input
                          value={rename.name}
                          onChange={(event) => {
                            setRename({ playerId: summary.playerId, name: event.target.value });
                            if (renameError) setRenameError(null);
                          }}
                          className="field min-h-9 py-1.5 font-mono text-[13px]"
                          autoComplete="off"
                          autoFocus
                          disabled={renaming}
                        />
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            className="btn btn-fill btn-sm"
                            disabled={renaming}
                          >
                            save
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => {
                              setRename(null);
                              setRenameError(null);
                            }}
                            disabled={renaming}
                          >
                            cancel
                          </button>
                        </div>
                        {renameError && (
                          <FormError className="max-w-[220px]">{renameError}</FormError>
                        )}
                      </form>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-sm min-h-[36px]"
                        onClick={() => {
                          setRename({ playerId: summary.playerId, name: summary.name });
                          setRenameError(null);
                        }}
                      >
                        rename
                      </button>
                    )}
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

function hasExistingPlayerName(
  snapshot: LiveGameSnapshot,
  rawName: string,
  excludePlayerId?: string
): boolean {
  const normalized = normalizeName(rawName);
  if (!normalized) return false;
  return snapshot.players.some(
    (player) =>
      player.status !== 'removed' &&
      player.playerId !== excludePlayerId &&
      normalizeName(player.name) === normalized
  );
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}
