interface LoadingViewProps {
  gameId: string;
}

export function LoadingView({ gameId }: LoadingViewProps) {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 pt-10 pb-24 animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <Spinner />
        <div>
          <p className="font-medium">Fetching ledger…</p>
          <p className="text-xs text-[var(--fg-dim)] font-mono">{gameId}</p>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="surface rounded-2xl p-5 space-y-3">
      <div className="skeleton h-4 w-1/3" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="skeleton h-8 w-8 rounded-full" />
          <div className="skeleton h-3 flex-1" />
          <div className="skeleton h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

function Spinner() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      className="animate-spin text-accent"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
