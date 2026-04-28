import { ThemeToggle } from './ThemeToggle';
import type { Theme } from '@/hooks/useTheme';

interface MastheadProps {
  theme: Theme;
  onThemeToggle: () => void;
  onReset?: () => void;
  showReset?: boolean;
  /** Optional ticker-tape items to display in the top sub-bar. */
  ticker?: TickerItem[];
}

export interface TickerItem {
  label: string;
  value: string;
  /** Tone shifts the value color: gain (teal) / loss (red) / accent (magenta). */
  tone?: 'gain' | 'loss' | 'accent';
}

export function Masthead({
  theme,
  onThemeToggle,
  onReset,
  showReset,
  ticker,
}: MastheadProps) {
  return (
    <header className="border-b border-line bg-bg sticky top-0 z-30">
      {/* Row 1: brand + actions */}
      <div className="border-b border-line">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-12 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-2.5 group"
            aria-label="settle.andrew.ee — start over"
          >
            <Brandmark />
            <span className="font-sans font-bold text-[14px] tracking-tight-2">
              settle<span className="text-fg-mute font-normal">.</span>andrew
              <span className="text-fg-mute font-normal">.</span>ee
            </span>
            <span className="pill pill-accent ml-1">
              <span className="live-dot" aria-hidden="true" />
              live
            </span>
          </button>

          <div className="flex items-center gap-1.5">
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
            <ThemeToggle theme={theme} onToggle={onThemeToggle} />
          </div>
        </div>
      </div>

      {/* Row 2: ticker tape (only when populated) */}
      {ticker && ticker.length > 0 && (
        <div className="bg-surface">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 h-9 flex items-center gap-5 sm:gap-7 overflow-x-auto scrollbar-none">
            {ticker.map((item, i) => (
              <span
                key={i}
                className="flex items-baseline gap-1.5 whitespace-nowrap shrink-0"
              >
                <span className="ticker-label">{item.label}</span>
                <span
                  className={
                    'font-mono num text-[12px] font-semibold tracking-tight-2 ' +
                    (item.tone === 'gain'
                      ? 'text-gain'
                      : item.tone === 'loss'
                        ? 'text-loss'
                        : item.tone === 'accent'
                          ? 'text-accent'
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
      width="20"
      height="20"
      viewBox="0 0 32 32"
      role="img"
      aria-label="settle"
      className="shrink-0"
    >
      <rect x="2" y="2" width="28" height="28" fill="none" stroke="rgb(var(--line-strong))" strokeWidth="1" />
      <path
        d="M5 22 L11 14 L16 18 L21 11 L27 8"
        stroke="rgb(var(--accent))"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="11" cy="14" r="1.8" fill="rgb(var(--gain))" />
      <circle cx="21" cy="11" r="1.8" fill="rgb(var(--loss))" />
    </svg>
  );
}
