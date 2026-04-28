/**
 * Top-of-page masthead — the brand mark sits above a heavy black rule and
 * thin date/issue line, like a newspaper or a classic accounting statement.
 * No icons, no theme toggle, no chrome — just type.
 */

interface MastheadProps {
  onReset?: () => void;
  showReset?: boolean;
}

const ISSUE_DATE = (() => {
  // Static at module load — appears as a "printed on" indicator.
  return new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
})();

export function Masthead({ onReset, showReset }: MastheadProps) {
  return (
    <header className="border-b-[3px] border-ink bg-paper">
      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        {/* Top dateline */}
        <div className="flex items-baseline justify-between text-[10px] uppercase tracking-masthead text-mute pt-3 pb-2">
          <span>vol. i &middot; no. 01</span>
          <span className="hidden sm:inline">poker night cashout</span>
          <span>{ISSUE_DATE}</span>
        </div>

        {/* Hairline */}
        <div className="h-px bg-ink/30" />

        {/* The wordmark */}
        <div className="py-3 sm:py-4 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onReset}
            className="block text-left group"
            aria-label="Settle — start over"
          >
            <h1 className="font-mono font-extrabold text-[28px] sm:text-[40px] leading-none tracking-tight">
              settle<span className="text-mute">.</span>andrew<span className="text-mute">.</span>ee
            </h1>
            <p className="text-[10px] uppercase tracking-masthead text-mute mt-2">
              minimum-payment settlement for pokernow games
            </p>
          </button>

          {showReset && (
            <button
              type="button"
              onClick={onReset}
              className="btn btn-sm hidden sm:inline-flex"
              aria-label="Start over with a new game"
            >
              new game
            </button>
          )}
        </div>

        {/* Bottom rule with thin double-line accent */}
        <div className="h-1 border-t border-b border-ink" />
      </div>
    </header>
  );
}
