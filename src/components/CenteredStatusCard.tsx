interface CenteredStatusCardProps {
  label: string;
  body?: string;
}

export function CenteredStatusCard({ label, body }: CenteredStatusCardProps) {
  return (
    <div className="mx-auto max-w-2xl px-5 sm:px-6 py-12">
      <div className="card">
        <div className="card-header">
          <span className="ticker-label-strong">
            <span className="live-dot mr-2 align-middle" aria-hidden="true" />
            {label}
          </span>
        </div>
        {body && <div className="px-5 py-6 text-[14px] text-fg-dim leading-relaxed">{body}</div>}
      </div>
    </div>
  );
}
