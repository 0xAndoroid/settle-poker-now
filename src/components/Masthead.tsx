interface MastheadProps {
  onReset?: () => void;
  showReset?: boolean;
  /** Optional ticker-tape items to display in the top sub-bar. */
  ticker?: TickerItem[];
}

export interface TickerItem {
  label: string;
  value: string;
  /** Tone shifts the value color: gain (green) / loss (red) / accent (blue) / live (purple). */
  tone?: 'gain' | 'loss' | 'accent' | 'live';
}

export function Masthead({ onReset, showReset, ticker }: MastheadProps) {
  return (
    <header
      className="sticky top-0 z-30 border-b border-line bg-bg"
      style={{ viewTransitionName: 'masthead' }}
    >
      {/* Row 1: brand + actions */}
      <div className={ticker && ticker.length > 0 ? 'border-b border-line' : undefined}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-[52px] flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-2.5 group"
            aria-label="settle.andrew.ee — start over"
          >
            <Brandmark />
            <span className="font-sans font-[700] text-[15px] tracking-[-0.02em]">
              settle
              <span className="text-fg-mute font-[500]">.andrew.ee</span>
            </span>
          </button>

          {showReset && (
            <button
              type="button"
              onClick={onReset}
              className="btn btn-ghost"
              aria-label="Start over with a new game"
            >
              new game
            </button>
          )}
        </div>
      </div>

      {/* Row 2: ticker tape (only when populated) */}
      {ticker && ticker.length > 0 && (
        <div>
          <div className="mx-auto max-w-6xl px-4 sm:px-6 h-9 flex items-center gap-5 sm:gap-7 overflow-x-auto scrollbar-none">
            {ticker.map((item, i) => (
              <span
                key={i}
                className="flex items-baseline gap-1.5 whitespace-nowrap shrink-0"
              >
                <span className="ticker-label">{item.label}</span>
                <span
                  className={
                    'num text-[12px] font-semibold ' +
                    (item.tone === 'gain'
                      ? 'text-gain'
                      : item.tone === 'loss'
                        ? 'text-loss'
                        : item.tone === 'accent'
                          ? 'text-accent'
                          : item.tone === 'live'
                            ? 'text-live'
                            : 'text-fg')
                  }
                >
                  {item.value}
                </span>
                {i < ticker.length - 1 && (
                  <span className="ml-5 sm:ml-7 text-line-strong" aria-hidden="true">
                    /
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}

function Brandmark() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 32 32"
      role="img"
      aria-label="settle"
      className="shrink-0 transition-transform duration-300 group-active:scale-[0.96]"
    >
      <rect
        x="1.5"
        y="1.5"
        width="29"
        height="29"
        rx="9"
        fill="rgb(var(--surface-2))"
        stroke="rgb(var(--hairline) / 0.16)"
        strokeWidth="1"
      />
      <path
        d="M7 21.5 L12.5 14.5 L17 18 L25 10.5"
        stroke="rgb(var(--blue))"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12.5" cy="14.5" r="1.9" fill="rgb(var(--green))" />
      <circle cx="25" cy="10.5" r="1.9" fill="rgb(var(--red))" />
    </svg>
  );
}
