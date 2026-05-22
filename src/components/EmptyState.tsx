import { useState, type FormEvent } from 'react';
import { extractGameId } from '@/lib/pokernow';

interface EmptyStateProps {
  /**
   * Pre-finalize ephemeral analyze step. Pulls the ledger by id, hydrates
   * the in-memory edit state, and lets the user add aliases / adjustments
   * / private rules. Persistence happens later via the `[ FINALIZE › ]`
   * button on the ephemeral view (this page has no shareable link CTA —
   * see system rewire).
   */
  onAnalyze: (gameId: string) => void;
  onStartLiveGame: () => void;
  loading?: boolean;
  startingLive?: boolean;
}

const PLACEHOLDER = 'pokernow.club/games/abc123…';

export function EmptyState({
  onAnalyze,
  onStartLiveGame,
  loading = false,
  startingLive = false,
}: EmptyStateProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    setSubmitting(true);
    onAnalyze(gameId);
    // Parent owns the state transition; the local flag is only for the
    // submit-button pressed-state spinner.
  };

  const isLoading = loading || submitting || startingLive;

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12 sm:py-20">
      {/* Hero */}
      <div className="mb-10 sm:mb-12">
        <p className="ticker-label text-accent mb-4">
          <span className="live-dot mr-2 align-middle" aria-hidden="true" />
          poker night settlement · v0.5
        </p>
        <h2 className="font-sans font-bold text-[40px] sm:text-[60px] leading-[0.98] tracking-tight-3 text-balance max-w-[18ch]">
          Settle the night in the fewest possible payments.
        </h2>
        <p className="mt-5 text-fg-dim text-[15px] sm:text-[16px] leading-relaxed max-w-[52ch]">
          Paste the PokerNow URL, fold duplicate players, record cash that changed hands, set
          private settlement rules — then finalize to mint a shareable link your group can mark off
          as they pay.
        </p>
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
        {/* URL input — terminal-style entry */}
        <form onSubmit={handleAnalyze} className="card flex h-full flex-col">
          <div className="card-header">
            <span className="ticker-label-strong">› paste game url</span>
            <span className="ticker-label hidden sm:inline">step 01 / 02</span>
          </div>
          <div className="flex flex-1 flex-col gap-4 p-4 sm:p-5">
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

            <button
              type="submit"
              disabled={isLoading || !valid}
              className="btn btn-fill mt-auto h-12 w-full text-[13px]"
            >
              {submitting ? 'loading…' : 'analyze ›'}
            </button>
          </div>
        </form>

        <section className="card flex h-full flex-col">
          <div className="card-header">
            <span className="ticker-label-strong">› live game</span>
            <span className="ticker-label hidden sm:inline">manual entry</span>
          </div>
          <div className="flex flex-1 flex-col gap-4 p-4 sm:p-5">
            <p className="text-[13px] text-fg-dim leading-relaxed">
              Start a shareable live table, record buy-ins and cashouts as they happen, then
              finalize into the same settlement page.
            </p>
            <button
              type="button"
              onClick={onStartLiveGame}
              disabled={isLoading}
              className="btn btn-fill mt-auto h-12 w-full text-[13px]"
            >
              {startingLive ? 'starting…' : 'start live game ›'}
            </button>
          </div>
        </section>
      </div>

      {/* Three-up feature row */}
      <div className="mt-8 grid sm:grid-cols-3 gap-3">
        {RULES.map((r, i) => (
          <div key={r.title} className="card p-4">
            <p className="ticker-label mb-2">
              {String(i + 1).padStart(2, '0')} · {r.tag}
            </p>
            <h3 className="font-sans font-semibold text-[14px] mb-1.5 leading-tight">{r.title}</h3>
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
    title: 'provably-min transactions',
    body: 'Subset-sum partitioning via bitmask DP — exact minimum for tables ≤ 15 players. Greedy max-creditor↔max-debtor fallback above that. Integer cents only.',
  },
  {
    tag: 'finalize',
    title: 'finalize → shareable link',
    body: 'Finalize when the modifications are right. The settlement plan locks; your group taps off payments as they hit Venmo / Zelle. Live preview in chat unfurls.',
  },
  {
    tag: 'rules',
    title: 'aliases · prior payments · private rules',
    body: '“Andrew2 is the same as Andrew.” “Kevin already paid Andrew $400.” “Andrew settles only with Kevin.” Stack them; the plan recomputes.',
  },
];
