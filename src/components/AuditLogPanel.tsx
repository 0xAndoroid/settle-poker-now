import { useState } from 'react';
import type { PersistedAuditEntry, PersistedPlayer } from '@/lib/types';

interface AuditLogPanelProps {
  entries: ReadonlyArray<PersistedAuditEntry>;
  players: ReadonlyArray<PersistedPlayer>;
}

const ACTION_LABEL: Record<string, string> = {
  create_game: 'created game',
  complete_payment: 'marked payment ✓',
  reopen_payment: 'reopened payment',
  add_adjustment: 'added prior payment',
  remove_adjustment: 'removed prior payment',
  set_isolation: 'isolated player',
  clear_isolation: 'cleared isolation',
  add_alias: 'aliased player',
  remove_alias: 'unfolded alias',
  finalize: 'finalized 🔒',
  unfinalize: 'unfinalized',
  set_payment_methods: 'set payment handles',
  set_note: 'set venmo note',
};

export function AuditLogPanel({ entries, players }: AuditLogPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? entries : entries.slice(0, 6);
  const nameById = new Map(players.map((p) => [p.playerId, p.nickname]));

  const summarize = (e: PersistedAuditEntry): string => {
    const payload = (e.payload ?? {}) as Record<string, unknown>;
    const fromId = typeof payload.fromPlayerId === 'string' ? payload.fromPlayerId : '';
    const toId = typeof payload.toPlayerId === 'string' ? payload.toPlayerId : '';
    const playerId = typeof payload.playerId === 'string' ? payload.playerId : '';
    const counterpartId =
      typeof payload.counterpartId === 'string' ? payload.counterpartId : '';
    const fromName = fromId ? (nameById.get(fromId) ?? fromId) : '';
    const toName = toId ? (nameById.get(toId) ?? toId) : '';
    const playerName = playerId ? (nameById.get(playerId) ?? playerId) : '';
    const counterpartName = counterpartId
      ? (nameById.get(counterpartId) ?? counterpartId)
      : '';

    switch (e.action) {
      case 'add_adjustment':
      case 'remove_adjustment': {
        const cents = typeof payload.amountCents === 'number' ? payload.amountCents : null;
        const amount = cents !== null ? `$${(cents / 100).toFixed(2)}` : '';
        const verb = e.action === 'add_adjustment' ? 'recorded' : 'removed';
        return [verb, fromName && toName ? `${fromName} → ${toName}` : '', amount]
          .filter(Boolean)
          .join(' ');
      }
      case 'set_isolation':
        return playerName && counterpartName
          ? `${playerName} settles only with ${counterpartName}`
          : 'set isolation rule';
      case 'clear_isolation':
        return playerName ? `cleared isolation for ${playerName}` : 'cleared isolation rule';
      case 'complete_payment':
        return 'marked a payment settled';
      case 'reopen_payment':
        return 'reopened a payment';
      case 'create_game':
        return 'created the link';
      default:
        return e.action;
    }
  };

  if (entries.length === 0) {
    return (
      <section aria-labelledby="audit-heading" className="card">
        <div className="card-header">
          <span id="audit-heading" className="ticker-label-strong">
            history
          </span>
          <span className="ticker-label">empty</span>
        </div>
        <div className="px-4 py-4 text-[12px] text-fg-mute italic">
          No actions recorded yet.
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="audit-heading" className="card">
      <div className="card-header">
        <span id="audit-heading" className="ticker-label-strong">
          history
        </span>
        <span className="ticker-label">{entries.length} entries</span>
      </div>
      <ul role="list">
        {visible.map((e) => (
          <li
            key={e.id}
            className="px-4 py-2.5 border-b border-line/60 last:border-b-0 flex items-center gap-3 text-[12.5px]"
          >
            <span className="ticker-label w-16 flex-shrink-0">
              {formatStamp(e.createdAt)}
            </span>
            <span className="font-semibold text-fg flex-shrink-0">
              {e.actorLabel ?? <span className="text-fg-mute italic">spectator</span>}
            </span>
            <span className="text-fg-dim flex-1 truncate">
              <span className="text-fg-mute"> · </span>
              {ACTION_LABEL[e.action] ?? e.action}
              {' '}
              <span className="text-fg-mute italic">{summarize(e)}</span>
            </span>
          </li>
        ))}
      </ul>
      {entries.length > 6 && (
        <div className="px-4 py-2 border-t border-line bg-surface-2 flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="ticker-label text-accent hover:text-fg"
          >
            {expanded ? '↑ collapse' : `↓ show ${entries.length - 6} more`}
          </button>
        </div>
      )}
    </section>
  );
}

function formatStamp(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
