import { useMemo, useState, type FormEvent } from 'react';
import { EmptyPanelMessage, FormError } from './FormControls';
import { LiveEntrySheet, type LiveEntryMode } from './LiveEntrySheet';
import type { ConfirmFn } from '@/hooks/useConfirmDialog';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { sendLossToHostOffer, type SendLossToHostOffer } from '@/lib/livePlayers';
import { formatDollars, formatNet } from '@/lib/money';
import type { LiveEntry, LiveGameSnapshot, LivePlayerStatus, LivePlayerSummary } from '@/lib/types';

interface LivePlayersPanelProps {
  snapshot: LiveGameSnapshot;
  confirm: ConfirmFn;
  onAddPlayer: (name: string, isHost?: boolean) => Promise<void>;
  onUpdatePlayer: (
    playerId: string,
    patch: { name?: string; status?: LivePlayerStatus; isHost?: boolean }
  ) => Promise<void>;
  onAddEntry: (body: {
    playerId: string;
    entryType: 'buy_in' | 'cash_out' | 'prior_payment';
    amountCents: number;
    toPlayerId?: string | null;
    isFinal?: boolean;
    note?: string | null;
  }) => Promise<void>;
  onVoidEntry: (entryId: string, reason?: string | null) => Promise<void>;
}

export function LivePlayersPanel({
  snapshot,
  confirm,
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
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const [sendingLossPlayerId, setSendingLossPlayerId] = useState<string | null>(null);

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

  const sendLossToHost = async (summary: LivePlayerSummary, offer: SendLossToHostOffer) => {
    const confirmed = await confirm({
      title: `Send ${summary.name}'s loss to the host?`,
      confirmLabel: 'record payment',
      body: (
        <p>
          Records that <span className="font-semibold text-fg">{summary.name}</span> paid{' '}
          <span className="font-semibold text-fg">{offer.hostName}</span>{' '}
          <span className="num text-fg">{formatDollars(offer.amountCents)}</span> — their
          full remaining loss. It shows in the activity log like any payment and can be voided
          there.
        </p>
      ),
    });
    if (!confirmed) return;
    setSendingLossPlayerId(summary.playerId);
    try {
      await onAddEntry({
        playerId: summary.playerId,
        entryType: 'prior_payment',
        amountCents: offer.amountCents,
        toPlayerId: offer.hostPlayerId,
        note: 'full loss sent to host',
      });
    } finally {
      setSendingLossPlayerId(null);
    }
  };

  const renderRenameForm = (
    playerId: string,
    {
      className,
      inputClassName,
      actionsClassName,
      saveClassName,
      cancelClassName,
    }: {
      className: string;
      inputClassName: string;
      actionsClassName: string;
      saveClassName: string;
      cancelClassName: string;
    }
  ) => (
    <form onSubmit={(event) => void submitRename(event, playerId)} className={className}>
      <input
        value={rename?.playerId === playerId ? rename.name : ''}
        onChange={(event) => {
          setRename({ playerId, name: event.target.value });
          if (renameError) setRenameError(null);
        }}
        className={inputClassName}
        autoComplete="off"
        autoFocus
        disabled={renaming}
      />
      <div className={actionsClassName}>
        <button type="submit" className={saveClassName} disabled={renaming}>
          save
        </button>
        <button
          type="button"
          className={cancelClassName}
          onClick={() => {
            setRename(null);
            setRenameError(null);
          }}
          disabled={renaming}
        >
          cancel
        </button>
      </div>
      {renameError && <FormError className="max-w-[220px]">{renameError}</FormError>}
    </form>
  );

  return (
    <section className="card" aria-labelledby="live-players-heading">
      <div className="card-header px-3 py-2.5 sm:px-[18px] sm:py-[14px]">
        <span id="live-players-heading" className="ticker-label-strong">
          players
          <span className="text-fg-mute font-normal ml-2">· {snapshot.playerSummaries.length}</span>
        </span>
        {host && (
          <span className="pill pill-live max-w-[190px] truncate sm:max-w-none">
            host · {host.name}
          </span>
        )}
      </div>

      <form onSubmit={addPlayer} className="border-b border-line p-2.5 sm:p-4 flex gap-2">
        <div className="min-w-0 flex-1 space-y-2">
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (nameError) setNameError(null);
            }}
            placeholder="add player"
            className="field h-11 min-h-11 text-[14px]"
            autoComplete="off"
            aria-invalid={addPlayerError ? 'true' : 'false'}
          />
          {addPlayerError && <FormError>{addPlayerError}</FormError>}
        </div>
        <button
          type="submit"
          className="btn btn-fill h-11 min-w-[64px] px-4"
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
            const isExpanded = expandedPlayerId === summary.playerId;
            const lossOffer = sendLossToHostOffer(snapshot, summary);
            const sendingLoss = sendingLossPlayerId === summary.playerId;
            return (
              <div key={summary.playerId} className="border-b border-line last:border-b-0">
                <div className="sm:hidden px-2.5 py-1.5">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <h3 className="truncate text-[14px] font-semibold leading-tight">
                          {summary.name}
                        </h3>
                        {summary.isHost && (
                          <span className="pill pill-live h-5 px-1.5 text-[9px] tracking-[0.1em]">
                            host
                          </span>
                        )}
                        <span className="pill h-5 px-1.5 text-[9px] tracking-[0.1em]">
                          {compactStatus(summary.status)}
                        </span>
                      </div>
                      <div className="mt-1 grid grid-cols-3 gap-2">
                        <Metric label="in" value={formatDollars(summary.buyInCents)} compact />
                        <Metric label="out" value={formatDollars(summary.cashOutCents)} compact />
                        <Metric label="net" value={formatNet(summary.netCents)} compact />
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <CompactActionButton
                        label="+in"
                        ariaLabel={`add buy-in for ${summary.name}`}
                        onClick={() => setSheet({ mode: 'buy_in', playerId: summary.playerId })}
                      />
                      <CompactActionButton
                        label="out"
                        ariaLabel={`add cashout for ${summary.name}`}
                        disabled={hasFinalCashout}
                        onClick={() => setSheet({ mode: 'cash_out', playerId: summary.playerId })}
                      />
                      <CompactActionButton
                        label="more"
                        ariaLabel={`${isExpanded ? 'hide' : 'show'} more actions for ${summary.name}`}
                        ariaExpanded={isExpanded}
                        onClick={() =>
                          setExpandedPlayerId((current) =>
                            current === summary.playerId ? null : summary.playerId
                          )
                        }
                      />
                    </div>
                  </div>
                  {(summary.priorPaymentCents > 0 || summary.priorReceivedCents > 0) && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] text-fg-dim">
                      {summary.priorPaymentCents > 0 && (
                        <span className="pill h-5 px-1.5">
                          paid {formatDollars(summary.priorPaymentCents)}
                        </span>
                      )}
                      {summary.priorReceivedCents > 0 && (
                        <span className="pill h-5 px-1.5">
                          received {formatDollars(summary.priorReceivedCents)}
                        </span>
                      )}
                    </div>
                  )}
                  {lossOffer && (
                    <SendLossToHostButton
                      playerName={summary.name}
                      offer={lossOffer}
                      busy={sendingLoss}
                      className="mt-1.5"
                      onClick={() => void sendLossToHost(summary, lossOffer)}
                    />
                  )}
                </div>

                {isExpanded && (
                  <div className="sm:hidden border-t border-line px-2.5 pb-2 pt-1.5">
                    {rename?.playerId === summary.playerId ? (
                      renderRenameForm(summary.playerId, {
                        className: 'space-y-2',
                        inputClassName: 'field h-11 min-h-11 py-2 text-[14px]',
                        actionsClassName: 'grid grid-cols-2 gap-1.5',
                        saveClassName: 'btn btn-fill h-11',
                        cancelClassName: 'btn h-11',
                      })
                    ) : (
                      <div className="grid grid-cols-3 gap-1.5">
                        <ActionButton
                          label="rename"
                          onClick={() => {
                            setRename({ playerId: summary.playerId, name: summary.name });
                            setRenameError(null);
                            setExpandedPlayerId(summary.playerId);
                          }}
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
                    )}
                  </div>
                )}

                <div className="hidden sm:block p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[16px] font-semibold leading-tight">{summary.name}</h3>
                        {summary.isHost && <span className="pill pill-live">host</span>}
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
                      renderRenameForm(summary.playerId, {
                        className: 'min-w-[180px] space-y-2',
                        inputClassName: 'field min-h-9 py-1.5 text-[13px]',
                        actionsClassName: 'flex gap-2',
                        saveClassName: 'btn btn-fill btn-sm',
                        cancelClassName: 'btn btn-sm',
                      })
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

                  {lossOffer && (
                    <SendLossToHostButton
                      playerName={summary.name}
                      offer={lossOffer}
                      busy={sendingLoss}
                      onClick={() => void sendLossToHost(summary, lossOffer)}
                    />
                  )}

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

function Metric({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className={compact ? 'ticker-label text-[8px] leading-none' : 'ticker-label'}>
        {label}
      </div>
      <div
        className={
          compact
            ? 'num truncate text-[11px] leading-tight font-semibold text-fg'
            : 'num font-semibold text-fg'
        }
      >
        {value}
      </div>
    </div>
  );
}

function SendLossToHostButton({
  playerName,
  offer,
  busy,
  className,
  onClick,
}: {
  playerName: string;
  offer: SendLossToHostOffer;
  busy: boolean;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`record that ${playerName} sent ${formatDollars(offer.amountCents)} to ${offer.hostName}`}
      onClick={onClick}
      disabled={busy}
      className={cn(
        'btn h-11 w-full border-accent text-accent text-[11px] font-bold uppercase tracking-[0.08em]',
        className
      )}
    >
      {busy ? 'recording...' : `send loss to host · ${formatDollars(offer.amountCents)}`}
    </button>
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

function CompactActionButton({
  label,
  ariaLabel,
  ariaExpanded,
  onClick,
  disabled = false,
}: {
  label: string;
  ariaLabel: string;
  ariaExpanded?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-expanded={ariaExpanded}
      onClick={onClick}
      disabled={disabled}
      className="btn h-11 w-11 px-0 text-[10px] font-bold uppercase tracking-[0.06em]"
    >
      {label}
    </button>
  );
}

function compactStatus(status: LivePlayerStatus): string {
  if (status === 'cashed_out') return 'out';
  if (status === 'removed') return 'off';
  return status;
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
