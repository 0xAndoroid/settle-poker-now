import { copyText } from '@/lib/clipboard';
import type { LiveSyncState } from '@/hooks/useLiveOutbox';

interface SyncStatusPanelProps {
  syncState: LiveSyncState;
  pendingCount: number;
  liveUrl: string;
  onToast: (message: string, variant?: 'success' | 'error' | 'info') => void;
}

export function SyncStatusPanel({
  syncState,
  pendingCount,
  liveUrl,
  onToast,
}: SyncStatusPanelProps) {
  const copy = async () => {
    const ok = await copyText(liveUrl);
    onToast(ok ? 'live link copied' : 'could not copy live link', ok ? 'success' : 'error');
  };

  const share = async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'settle.andrew.ee live game', url: liveUrl });
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
      }
    }
    await copy();
  };

  return (
    <section className="card" aria-labelledby="sync-status-heading">
      <div className="card-header">
        <span id="sync-status-heading" className="ticker-label-strong">
          sync
        </span>
        <span
          className={
            syncState === 'online'
              ? 'pill pill-gain'
              : syncState === 'error' || syncState === 'offline'
                ? 'pill pill-loss'
                : 'pill pill-accent'
          }
        >
          {syncState}
        </span>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="ticker-label">unsynced</span>
          <span className="font-mono num font-bold">{pendingCount}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={copy} className="btn h-11">
            copy link
          </button>
          <button type="button" onClick={share} className="btn btn-fill h-11">
            share
          </button>
        </div>
      </div>
    </section>
  );
}
