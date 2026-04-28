import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';
import type { Theme } from '@/hooks/useTheme';

interface HeaderProps {
  theme: Theme;
  onThemeToggle: () => void;
  onReset?: () => void;
  showReset?: boolean;
}

export function Header({ theme, onThemeToggle, onReset, showReset }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 backdrop-blur-md bg-[var(--bg)]/80 border-b border-[var(--border)]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-2.5 group min-h-[44px]"
          aria-label="Settle Poker Now — home"
        >
          <Logo className="h-7 w-7" />
          <span className="font-semibold tracking-tight text-[15px] sm:text-[16px]">
            <span className="text-[var(--fg)]">settle.</span>
            <span className="text-accent">poker</span>
          </span>
        </button>

        <div className="flex items-center gap-1.5">
          {showReset && (
            <button
              type="button"
              onClick={onReset}
              className="btn-ghost"
              aria-label="Start over with a new game"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
              <span className="hidden sm:inline">New game</span>
            </button>
          )}
          <ThemeToggle theme={theme} onToggle={onThemeToggle} />
        </div>
      </div>
    </header>
  );
}
