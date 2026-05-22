import { useState } from 'react';
import { DEFAULT_PAYMENT_NOTE } from '@/lib/paymentLinks';

interface PersistentColophonProps {
  gameId: string;
  isFinalized: boolean;
  finalizedAt: number | null;
  finalizedBy: string | null;
  note: string | null;
  onSaveNote: (next: string | null) => Promise<void>;
}

export function PersistentColophon({
  gameId,
  isFinalized,
  finalizedAt,
  finalizedBy,
  note,
  onSaveNote,
}: PersistentColophonProps) {
  const stamp = finalizedAt
    ? new Date(finalizedAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : null;
  return (
    <aside className="card p-5 text-[12.5px] leading-relaxed text-fg-dim">
      <p className="ticker-label-strong mb-2">¶ persistent link</p>
      <p>
        <span className="text-fg font-semibold">/g/{gameId}</span> is the canonical URL for this
        game. Anyone with the link sees the same live state — including which payments have been
        marked settled.
      </p>
      <hr className="hr my-3" />
      {isFinalized && stamp && (
        <p className="mb-3">
          <span className="pill pill-accent">finalized</span>{' '}
          <span className="text-fg font-semibold">{stamp}</span>
          {finalizedBy ? (
            <>
              {' '}
              <span className="text-fg-mute">·</span>{' '}
              <span className="text-fg font-semibold">{finalizedBy}</span>
            </>
          ) : null}
        </p>
      )}
      <NoteEditor note={note} onSave={onSaveNote} />
      <hr className="hr my-3" />
      <p>Polling every 8s while this tab is open. Marking a payment refreshes all open viewers.</p>
    </aside>
  );
}

function NoteEditor({
  note,
  onSave,
}: {
  note: string | null;
  onSave: (next: string | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const display = note && note.trim().length > 0 ? note : DEFAULT_PAYMENT_NOTE;
  const isDefault = !note || note.trim().length === 0;

  const enterEdit = () => {
    setDraft(note ?? '');
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft('');
  };

  const submit = async () => {
    setSaving(true);
    const trimmed = draft.trim();
    try {
      await onSave(trimmed.length > 0 ? trimmed : null);
      setEditing(false);
      setDraft('');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <p className="flex items-baseline gap-2 flex-wrap">
        <span className="ticker-label">venmo note ·</span>
        <span className={isDefault ? 'text-fg-dim italic' : 'text-fg font-semibold'}>
          {display}
        </span>
        <button
          type="button"
          onClick={enterEdit}
          className="ticker-label text-accent hover:text-fg"
          aria-label="Edit Venmo note"
        >
          ✎ edit
        </button>
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <label htmlFor="note-editor-input" className="ticker-label block">
        venmo note
      </label>
      <input
        id="note-editor-input"
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={DEFAULT_PAYMENT_NOTE}
        maxLength={80}
        className="field w-full font-mono text-[13px]"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        autoFocus
      />
      <div className="flex items-center gap-2">
        <button type="button" onClick={submit} disabled={saving} className="btn btn-fill btn-sm">
          {saving ? 'saving…' : 'save ›'}
        </button>
        <button
          type="button"
          onClick={cancelEdit}
          disabled={saving}
          className="btn btn-ghost btn-sm"
        >
          cancel
        </button>
      </div>
    </div>
  );
}
