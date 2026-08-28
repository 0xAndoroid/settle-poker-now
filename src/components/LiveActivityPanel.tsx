import { useState } from 'react';
import { EmptyPanelMessage } from './FormControls';
import { formatDollars } from '@/lib/money';
import type { LiveOutboxItem } from '@/lib/liveStorage';
import type {
  LiveAuditEntry,
  LiveChipCheckpoint,
  LiveEntry,
  LiveGameSnapshot,
} from '@/lib/types';

interface LiveActivityPanelProps {
  snapshot: LiveGameSnapshot;
  outboxItems: LiveOutboxItem[];
  onVoidEntry: (entryId: string, reason?: string | null) => Promise<void>;
}

export function LiveActivityPanel({
  snapshot,
  outboxItems,
  onVoidEntry,
}: LiveActivityPanelProps) {
  const [open, setOpen] = useState(false);
  const playerName = (id: string | null) =>
    id ? snapshot.players.find((player) => player.playerId === id)?.name ?? id : '';
  const queueItems = outboxItems.filter((item) => item.status !== 'synced').slice(-5);
  const events = [
    ...snapshot.entries.map((entry) => ({
      id: entry.id,
      kind: 'entry' as const,
      createdAt: entry.createdAt,
      entry,
    })),
    ...snapshot.chipCheckpoints.map((checkpoint) => ({
      id: checkpoint.id,
      kind: 'checkpoint' as const,
      createdAt: checkpoint.createdAt,
      checkpoint,
    })),
    ...snapshot.audit.map((audit) => ({
      id: audit.id,
      kind: 'audit' as const,
      createdAt: audit.createdAt,
      audit,
    })),
  ].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <section className="card kc-purple" aria-labelledby="live-activity-heading">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="live-activity-body"
        className={`card-header w-full text-left cursor-pointer transition-colors duration-300 ${open ? '' : 'border-b-transparent'}`}
      >
        <span id="live-activity-heading" className="ticker-label-strong">
          activity
          <span className="text-fg-mute font-normal ml-2">
            · {events.length}
          </span>
        </span>
        <span
          aria-hidden="true"
          className={`ticker-label transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
        >
          ▾
        </span>
      </button>

      <div id="live-activity-body" className="disclosure" data-open={open}>
        <div>
          {queueItems.length > 0 && (
            <div className="border-b border-line bg-fill-1 px-4 py-3 space-y-2">
              {queueItems.map((item) => (
                <div key={item.clientEventId} className="flex items-center justify-between gap-3">
                  <span className="ticker-label">{pendingLabel(item, playerName)}</span>
                  <span className={item.status === 'error' ? 'pill pill-loss' : 'pill'}>
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          )}

          {events.length === 0 ? (
            <EmptyPanelMessage>Entries and chip counts will appear here.</EmptyPanelMessage>
          ) : (
            <ol>
              {events.map((event) =>
                event.kind === 'entry' ? (
                  <EntryRow
                    key={event.id}
                    entry={event.entry}
                    playerName={playerName}
                    onVoidEntry={onVoidEntry}
                  />
                ) : event.kind === 'audit' ? (
                  <AuditRow key={event.id} audit={event.audit} playerName={playerName} />
                ) : (
                  <CheckpointRow key={event.id} checkpoint={event.checkpoint} />
                )
              )}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}

function EntryRow({
  entry,
  playerName,
  onVoidEntry,
}: {
  entry: LiveEntry;
  playerName: (id: string | null) => string;
  onVoidEntry: (entryId: string, reason?: string | null) => Promise<void>;
}) {
  const copy = entryCopy(entry, playerName);
  return (
    <li className="border-b border-line last:border-b-0 p-4">
      <div className={entry.voidedAt ? 'opacity-50' : ''}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="ticker-label-strong">{copy.label}</p>
            <p className="text-[14px] text-fg mt-1">{copy.detail}</p>
            {entry.voidedAt && (
              <p className="text-[12px] text-loss mt-1">
                voided{entry.voidReason ? ` · ${entry.voidReason}` : ''}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <TimeStamp value={entry.createdAt} />
            {!entry.voidedAt && !entry.id.startsWith('pending_') && (
              <button
                type="button"
                className="btn btn-sm min-h-[36px]"
                onClick={() => void onVoidEntry(entry.id, 'voided from activity')}
              >
                void
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

function CheckpointRow({ checkpoint }: { checkpoint: LiveChipCheckpoint }) {
  return (
    <li className="border-b border-line last:border-b-0 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="ticker-label-strong">{checkpointLabel(checkpoint.checkpointType)}</p>
          <p className="text-[13px] text-fg-dim mt-1">
            count {formatDollars(checkpoint.amountCents)}
            {checkpoint.deltaCents !== null &&
              ` · delta ${formatDollars(checkpoint.deltaCents, { signed: true })}`}
          </p>
        </div>
        <TimeStamp value={checkpoint.createdAt} />
      </div>
    </li>
  );
}

function AuditRow({
  audit,
  playerName,
}: {
  audit: LiveAuditEntry;
  playerName: (id: string | null) => string;
}) {
  const label = auditLabel(audit, playerName);
  if (!label) return null;
  return (
    <li className="border-b border-line last:border-b-0 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="ticker-label-strong">table update</p>
          <p className="text-[14px] text-fg mt-1">{label}</p>
        </div>
        <TimeStamp value={audit.createdAt} />
      </div>
    </li>
  );
}

function entryCopy(
  entry: LiveEntry,
  playerName: (id: string | null) => string
): { label: string; detail: string } {
  const player = playerName(entry.playerId);
  const amount = formatDollars(entry.amountCents);
  if (entry.entryType === 'buy_in') {
    return { label: 'buy-in', detail: `${player} bought in for ${amount}` };
  }
  if (entry.entryType === 'cash_out') {
    if (entry.isFinal && entry.amountCents === 0) {
      return { label: 'busted', detail: `${player} busted with a $0 cashout` };
    }
    return {
      label: entry.isFinal ? 'final cashout' : 'cashout',
      detail: `${player} cashed out ${amount}`,
    };
  }
  return {
    label: 'prior payment',
    detail: `${player} paid ${playerName(entry.toPlayerId)} ${amount}`,
  };
}

function pendingLabel(
  item: LiveOutboxItem,
  playerName: (id: string | null) => string
): string {
  const request = item.request;
  if (request.kind === 'add_player') return `Adding ${request.body.name}`;
  if (request.kind === 'patch_player') {
    if (request.body.name) return `Renaming ${playerName(request.playerId)}`;
    if (request.body.isHost === true) return `Setting ${playerName(request.playerId)} as host`;
    return `Updating ${playerName(request.playerId)}`;
  }
  if (request.kind === 'add_entry') {
    return entryCopy(
      {
        id: item.clientEventId,
        gameId: item.gameId,
        playerId: request.body.playerId,
        entryType: request.body.entryType,
        amountCents: request.body.amountCents,
        toPlayerId: request.body.toPlayerId ?? null,
        paymentMethod: request.body.paymentMethod ?? null,
        isFinal: request.body.isFinal === true,
        note: request.body.note ?? null,
        clientEventId: item.clientEventId,
        createdAt: item.createdAt,
        createdBy: null,
        voidedAt: null,
        voidedBy: null,
        voidReason: null,
      },
      playerName
    ).detail;
  }
  if (request.kind === 'busted_paid_host') {
    return `${playerName(request.body.playerId)} busted and paid ${formatDollars(
      request.body.amountCents
    )}`;
  }
  if (request.kind === 'void_entry') return 'Voiding entry';
  return `Recording ${checkpointLabel(request.body.checkpointType).toLocaleLowerCase()}`;
}

function checkpointLabel(type: LiveChipCheckpoint['checkpointType']): string {
  if (type === 'set_bank_total') return 'Set chip bank total';
  if (type === 'verify_table_count') return 'Counted table chips';
  return 'Counted bank tray';
}

function auditLabel(
  audit: LiveAuditEntry,
  playerName: (id: string | null) => string
): string | null {
  const payload = asRecord(audit.payload);
  const playerId = stringValue(payload.playerId);
  const name = stringValue(payload.name);
  if (audit.action === 'create_live_game') return 'Live game created';
  if (audit.action === 'add_player') return `${name ?? playerName(playerId)} joined`;
  if (audit.action === 'set_host') return `${playerName(playerId)} set as host`;
  if (audit.action === 'update_player') {
    if (name) return `${playerName(playerId)} renamed to ${name}`;
    const status = stringValue(payload.status);
    if (status) return `${playerName(playerId)} marked ${status.replaceAll('_', ' ')}`;
    return `${playerName(playerId)} updated`;
  }
  if (audit.action === 'void_entry') return 'Entry voided';
  if (audit.action === 'busted_paid_host') {
    const amount = numberValue(payload.amountCents);
    return `${playerName(playerId)} busted and paid ${
      amount === null ? '' : formatDollars(amount)
    }`.trim();
  }
  if (audit.action === 'force_finalize') return 'Finalized with chip discrepancy';
  if (audit.action === 'finalize_live_game') return 'Live game finalized';
  if (audit.action === 'abandon_live_game') return 'Live game deleted';
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function TimeStamp({ value }: { value: number }) {
  return (
    <span className="ticker-label whitespace-nowrap">
      {new Date(value).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })}
    </span>
  );
}
