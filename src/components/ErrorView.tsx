interface ErrorViewProps {
  message: string;
  gameId: string | null;
  onRetry: () => void;
  onReset: () => void;
}

export function ErrorView({ message, gameId, onRetry, onReset }: ErrorViewProps) {
  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-12">
      <div className="card border-loss/60">
        <div className="card-header bg-loss/10 border-b-loss/40">
          <span className="ticker-label-strong text-loss">
            ⚠ void · could not print
          </span>
          {gameId && (
            <span className="ticker-label">game/{gameId}</span>
          )}
        </div>
        <div className="px-6 py-7 sm:px-8 sm:py-9 space-y-5">
          <p className="font-sans text-[15px] leading-relaxed text-fg">{message}</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onReset} className="btn">
              new url
            </button>
            <button type="button" onClick={onRetry} className="btn btn-fill">
              retry ›
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
