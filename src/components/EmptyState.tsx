import { useState, type FormEvent } from 'react';
import { extractGameId } from '@/lib/pokernow';

interface EmptyStateProps {
  /** Ephemeral flow: parse hash + render in-memory. */
  onAnalyze: (gameId: string) => void;
  /** Persistent flow: POST to /api/games, then navigate to /g/<id>. */
  onCreateLink: (pokernowUrl: string) => Promise<void>;
  loading?: boolean;
}

const PLACEHOLDER = 'pokernow.club/games/abc123…';

export function EmptyState({ onAnalyze, onCreateLink, loading = false }: EmptyStateProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<'analyze' | 'persist' | null>(null);

  const trimmed = value.trim();
  const valid = !!extractGameId(trimmed);

  const handleAnalyze = (e: FormEvent) => {
    e.preventDefault();
    const gameId = extractGameId(trimmed);
    if (!gameId) {
      setError('Not a recognized PokerNow game URL.');
      return;
    }
    setError(null);
    setSubmitting('analyze');
    onAnalyze(gameId);
    // The parent handles state transition; resetting the local flag on
    // unmount or via the loading prop change is enough.
  };

  const handlePersist = async () => {
    if (!extractGameId(trimmed)) {
      setError('Not a recognized PokerNow game URL.');
      return;
    }
    setError(null);
    setSubmitting('persist');
    try {
      await onCreateLink(trimmed);
    } catch (err) {
      setSubmitting(null);
      setError((err as Error).message);
    }
  };

  const isLoading = loading || submitting !== null;

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12 sm:py-20">
      {/* Hero */}
      <div className="mb-10 sm:mb-12">
        <p className="ticker-label text-accent mb-4">
          <span className="live-dot mr-2 align-middle" aria-hidden="true" />
          poker night settlement · v0.4
        </p>
        <h2 className="font-sans font-bold text-[40px] sm:text-[60px] leading-[0.98] tracking-tight-3 text-balance max-w-[18ch]">
          Settle the night in the fewest possible payments.
        </h2>
        <p className="mt-5 text-fg-dim text-[15px] sm:text-[16px] leading-relaxed max-w-[52ch]">
          Greedy debt simplification. Per-player isolation rules. Mark
          payments settled together. State lives in the URL hash for
          ad-hoc games — or persist with a shareable link that updates as
          your group pays.
        </p>
      </div>

      {/* URL input — terminal-style entry */}
      <form onSubmit={handleAnalyze} className="card">
        <div className="card-header">
          <span className="ticker-label-strong">› paste game url</span>
          <span className="ticker-label hidden sm:inline">step 01 / 03</span>
        </div>
        <div className="p-4 sm:p-5 space-y-4">
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
              disabled={isLoading}
              className="field flex-1 font-mono text-[14px]"
              aria-invalid={error ? 'true' : 'false'}
              aria-describedby={error ? 'game-url-error' : undefined}
            />
          </div>

          {/* Two side-by-side actions */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-stretch">
            <button
              type="button"
              onClick={handlePersist}
              disabled={isLoading || !valid}
              className="btn btn-fill h-12 text-[13px]"
            >
              {submitting === 'persist' ? 'creating…' : 'create persistent link ›'}
            </button>
            <button
              type="submit"
              disabled={isLoading || !valid}
              className="btn h-12 text-[13px]"
            >
              {submitting === 'analyze' ? 'loading…' : 'analyze (ephemeral)'}
            </button>
          </div>

          {error && (
            <p
              id="game-url-error"
              className="text-loss text-[12px] font-semibold flex items-center gap-2"
              role="alert"
            >
              <span className="pill pill-loss">err</span>
              {error}
            </p>
          )}
          <div className="flex items-center gap-2 text-[12px] text-fg-mute">
            <span>no game?</span>
            <button
              type="button"
              onClick={() => onAnalyze('demo')}
              disabled={isLoading}
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
    tag: 'persist',
    title: 'shareable persistent links',
    body: 'Hit “create link”, drop it in chat, watch payments tick off as your group pays. Live preview in iMessage / Telegram unfurls.',
  },
  {
    tag: 'rules',
    title: 'isolated-player + adjustments',
    body: '“Andrew settles only with Kevin.” Already paid in cash? Record it. The plan recomputes.',
  },
];
