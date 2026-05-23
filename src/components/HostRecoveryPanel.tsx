interface HostRecoveryPanelProps {
  liveUrl: string;
  deleting?: boolean;
  onDelete: () => void;
}

export function HostRecoveryPanel({
  liveUrl,
  deleting = false,
  onDelete,
}: HostRecoveryPanelProps) {
  return (
    <aside className="card p-5 text-[12.5px] leading-relaxed text-fg-dim">
      <p className="ticker-label-strong mb-2">¶ recovery link</p>
      <p>
        Anyone with this live link can edit the table. D1 stores synced
        changes, and this browser keeps unsynced changes in IndexedDB until
        they replay.
      </p>
      <hr className="hr my-3" />
      <p className="font-mono text-[11px] break-all text-fg">{liveUrl}</p>
      <hr className="hr my-3" />
      <div className="flex items-center justify-between gap-3">
        <p className="ticker-label-strong text-loss">delete table</p>
        <button
          type="button"
          className="btn btn-sm border-loss text-loss"
          onClick={onDelete}
          disabled={deleting}
        >
          {deleting ? 'deleting...' : 'delete'}
        </button>
      </div>
    </aside>
  );
}
