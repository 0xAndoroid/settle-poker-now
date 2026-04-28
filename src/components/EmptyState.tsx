import { useState, type FormEvent } from 'react';
import { extractGameId } from '@/lib/pokernow';

interface EmptyStateProps {
  onSubmit: (gameId: string) => void;
  loading?: boolean;
}

const PLACEHOLDER = 'pokernow.club/games/abc123…';

export function EmptyState({ onSubmit, loading = false }: EmptyStateProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const gameId = extractGameId(value);
    if (!gameId) {
      setError('Not a recognized PokerNow game URL.');
      return;
    }
    setError(null);
    onSubmit(gameId);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12 sm:py-20">
      {/* Hero */}
      <div className="mb-10 sm:mb-12">
        <p className="ticker-label text-accent mb-4">
          <span className="live-dot mr-2 align-middle" aria-hidden="true" />
          poker night settlement · v0.3
        </p>
        <h2 className="font-sans font-bold text-[40px] sm:text-[60px] leading-[0.98] tracking-tight-3 text-balance max-w-[18ch]">
          Settle the night in the fewest possible payments.
        </h2>
        <p className="mt-5 text-fg-dim text-[15px] sm:text-[16px] leading-relaxed max-w-[52ch]">
          Greedy debt simplification. Per-player isolation rules. Already-paid
          adjustments. State lives in the URL hash. Plan exports as a 4:5 image
          for chat.
        </p>
      </div>

      {/* URL input — terminal-style entry */}
      <form onSubmit={handleSubmit} className="card">
        <div className="card-header">
          <span className="ticker-label-strong">› paste game url</span>
          <span className="ticker-label hidden sm:inline">step 01 / 03</span>
        </div>
        <div className="p-4 sm:p-5">
          <div className="flex items-stretch gap-2 sm:gap-3">
            <span
              aria-hidden="true"
              className="flex items-center pl-1 text-accent font-mono text-[15px] font-semibold select-none"
            >
              ›
            </span>
            <input
              id="game-url"
              name="game-url"
              type="text"
              inputMode="url"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError(null);
              }}
              placeholder={PLACEHOLDER}
              disabled={loading}
              className="field flex-1 font-mono text-[14px]"
              aria-invalid={error ? 'true' : 'false'}
              aria-describedby={error ? 'game-url-error' : undefined}
            />
            <button
              type="submit"
              disabled={loading || !value.trim()}
              className="btn btn-fill min-w-[120px]"
            >
              {loading ? 'loading…' : 'settle ›'}
            </button>
          </div>
          {error && (
            <p
              id="game-url-error"
              className="mt-3 text-loss text-[12px] font-semibold flex items-center gap-2"
              role="alert"
            >
              <span className="pill pill-loss">err</span>
              {error}
            </p>
          )}
          <div className="mt-4 flex items-center gap-2 text-[12px] text-fg-mute">
            <span>no game?</span>
            <button
              type="button"
              onClick={() => onSubmit('demo')}
              disabled={loading}
              className="text-accent hover:underline underline-offset-4 font-semibold"
            >
              run with demo data ›
            </button>
          </div>
        </div>
      </form>

      {/* Three-up feature row */}
      <div className="mt-8 grid sm:grid-cols-3 gap-3">
        {RULES.map((r, i) => (
          <div key={r.title} className="card p-4">
            <p className="ticker-label mb-2">
              {String(i + 1).padStart(2, '0')} · {r.tag}
            </p>
            <h3 className="font-sans font-semibold text-[14px] mb-1.5 leading-tight">
              {r.title}
            </h3>
            <p className="text-[12.5px] text-fg-dim leading-relaxed">{r.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const RULES: { tag: string; title: string; body: string }[] = [
  {
    tag: 'algo',
    title: 'min-transaction settlement',
    body: 'Greedy max-creditor↔max-debtor. ≤ N−1 payments for N players. Integer cents only — no float drift.',
  },
  {
    tag: 'rules',
    title: 'isolated-player rules',
    body: '“Andrew settles only with Kevin.” Hub-and-spoke. Cycles get caught and surfaced.',
  },
  {
    tag: 'export',
    title: 'tap-to-copy + image share',
    body: 'Tap any payment to copy. Hit SHARE for a 4:5 PNG — clipboard on desktop, native sheet on mobile.',
  },
];
