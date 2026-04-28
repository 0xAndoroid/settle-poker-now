interface LoadingViewProps {
  gameId: string;
}

export function LoadingView({ gameId }: LoadingViewProps) {
  return (
    <div className="mx-auto max-w-3xl px-5 sm:px-8 py-12">
      <div className="slab">
        <div className="slab-heading">
          <span>fetching ledger</span>
          <span className="font-mono normal-case tracking-normal text-[10px] text-mute">
            game/{gameId}
          </span>
        </div>
        <div className="px-6 py-10 text-center">
          <p className="font-mono text-[14px] font-bold uppercase tracking-masthead">
            <Dots /> printing
          </p>
          <p className="text-[11px] uppercase tracking-all text-mute mt-3">
            proxy → pokernow.com → ledger.csv → cents → settle
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
