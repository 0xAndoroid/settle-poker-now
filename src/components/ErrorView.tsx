interface ErrorViewProps {
  message: string;
  gameId: string | null;
  onRetry: () => void;
  onReset: () => void;
}

export function ErrorView({ message, gameId, onRetry, onReset }: ErrorViewProps) {
  return (
    <div className="mx-auto max-w-xl px-4 sm:px-6 pt-12 pb-24 animate-fade-in">
      <div className="surface rounded-2xl p-6 sm:p-8 text-center space-y-5 border-loss/20">
        <div className="mx-auto w-12 h-12 rounded-full bg-loss/10 flex items-center justify-center text-loss">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-semibold tracking-tight mb-2">
            Couldn&apos;t load that game
          </h2>
          <p className="text-sm text-[var(--fg-dim)] text-balance">{message}</p>
          {gameId && (
            <p className="text-xs text-[var(--fg-mute)] font-mono mt-2">{gameId}</p>
          )}
        </div>
        <div className="flex items-center justify-center gap-2">
          <button type="button" onClick={onReset} className="btn-secondary">
            Try a different URL
          </button>
          <button type="button" onClick={onRetry} className="btn-primary">
            Retry
          </button>
        </div>
      </div>
    </div>
  );
}
