interface ErrorViewProps {
  message: string;
  gameId: string | null;
  onRetry: () => void;
  onReset: () => void;
}

export function ErrorView({ message, gameId, onRetry, onReset }: ErrorViewProps) {
  return (
    <div className="mx-auto max-w-2xl px-5 sm:px-8 py-12">
      <div className="slab" style={{ borderColor: '#a8201a' }}>
        <div
          className="slab-heading"
          style={{ background: '#fbeae8', color: '#a8201a', borderColor: '#a8201a' }}
        >
          <span>void · could not print</span>
          {gameId && (
            <span className="font-mono normal-case tracking-normal text-[10px]">
              game/{gameId}
            </span>
          )}
        </div>
        <div className="px-6 py-8 sm:px-8 sm:py-10 space-y-5">
          <p className="font-mono text-[15px] leading-relaxed">{message}</p>
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
