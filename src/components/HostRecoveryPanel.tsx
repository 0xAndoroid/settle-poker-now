interface HostRecoveryPanelProps {
  liveUrl: string;
}

export function HostRecoveryPanel({ liveUrl }: HostRecoveryPanelProps) {
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
    </aside>
  );
}
