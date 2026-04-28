interface LoadingViewProps {
  gameId: string;
}

export function LoadingView({ gameId }: LoadingViewProps) {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
      <div className="card">
        <div className="card-header">
          <span className="ticker-label-strong">
            <span className="live-dot mr-2 align-middle" aria-hidden="true" />
            fetching ledger
          </span>
          <span className="ticker-label">game/{gameId}</span>
        </div>
        <div className="px-6 py-12 text-center">
          <p className="font-sans font-bold text-[14px] text-fg uppercase tracking-ticker">
            <Dots /> printing
          </p>
          <p className="ticker-label mt-3 text-fg-mute">
            proxy → pokernow.com → ledger.csv → cents-detect → settle
          </p>
        </div>
      </div>
    </div>
  );
}

function Dots() {
  return (
    <span aria-hidden="true" className="inline-block w-12 text-left">
      <span className="dot dot-1">·</span>
      <span className="dot dot-2">·</span>
      <span className="dot dot-3">·</span>
      <style>{`
        .dot { opacity: 0.25; animation: dotpulse 1.2s infinite; }
        .dot-1 { animation-delay: 0s; }
        .dot-2 { animation-delay: 0.15s; }
        .dot-3 { animation-delay: 0.3s; }
        @keyframes dotpulse {
          0%, 100% { opacity: 0.25; }
          50% { opacity: 1; }
        }
      `}</style>
    </span>
  );
}
