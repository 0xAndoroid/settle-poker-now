import { EmptyPanelMessage } from './FormControls';
import { formatDollars } from '@/lib/money';
import type { LiveOutboxItem } from '@/lib/liveStorage';
import type { LiveEntry, LiveGameSnapshot } from '@/lib/types';

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
  const playerName = (id: string | null) =>
    id ? snapshot.players.find((player) => player.playerId === id)?.name ?? id : '';
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
  ].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <section className="card" aria-labelledby="live-activity-heading">
      <div className="card-header">
        <span id="live-activity-heading" className="ticker-label-strong">
          activity
          <span className="text-fg-mute font-normal ml-2">
            · {events.length}
          </span>
        </span>
      </div>

      {outboxItems.length > 0 && (
        <div className="border-b border-line bg-surface-2 px-4 py-3 space-y-2">
          {outboxItems.slice(-5).map((item) => (
            <div key={item.clientEventId} className="flex items-center justify-between gap-3">
              <span className="ticker-label">{item.request.kind.replaceAll('_', ' ')}</span>
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
            ) : (
              <li key={event.id} className="border-b border-line last:border-b-0 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="ticker-label-strong">
                      {event.checkpoint.checkpointType.replaceAll('_', ' ')}
                    </p>
                    <p className="text-[13px] text-fg-dim mt-1">
                      count {formatDollars(event.checkpoint.amountCents)}
                      {event.checkpoint.deltaCents !== null &&
                        ` · delta ${formatDollars(event.checkpoint.deltaCents, { signed: true })}`}
                    </p>
                  </div>
                  <TimeStamp value={event.createdAt} />
                </div>
              </li>
            )
          )}
        </ol>
      )}
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
  const label =
    entry.entryType === 'buy_in'
      ? 'buy-in'
      : entry.entryType === 'cash_out'
        ? entry.isFinal
          ? 'final cashout'
          : 'cashout'
        : 'prior payment';
  return (
    <li className="border-b border-line last:border-b-0 p-4">
      <div className={entry.voidedAt ? 'opacity-50' : ''}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="ticker-label-strong">{label}</p>
            <p className="text-[14px] text-fg mt-1">
              {playerName(entry.playerId)}{' '}
              {entry.toPlayerId ? `to ${playerName(entry.toPlayerId)} ` : ''}
              <span className="font-mono num font-bold">
                {formatDollars(entry.amountCents)}
              </span>
            </p>
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
