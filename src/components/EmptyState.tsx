import { useState, type FormEvent } from 'react';
import { RecentGamesPanel } from './RecentGamesPanel';
import { extractGameId } from '@/lib/pokernow';

interface EmptyStateProps {
  /**
   * Pre-finalize ephemeral analyze step. Pulls the ledger by id, hydrates
   * the in-memory edit state, and lets the user add aliases / adjustments
   * / private rules. Persistence happens later via the finalize button on
   * the ephemeral view (this page has no shareable link CTA — see system
   * rewire).
   */
  onAnalyze: (gameId: string) => void;
  onStartLiveGame: () => void;
  loading?: boolean;
  startingLive?: boolean;
}

const PLACEHOLDER = 'pokernow.club/games/abc123…';
const VERSION_LABEL = `v${__APP_VERSION__.split('.').slice(0, 2).join('.')}`;

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
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12 sm:py-20 stagger">
      {/* Hero — editorial serif display, same voice as the report system. */}
      <div className="mb-10 sm:mb-12">
        <p className="ticker-label mb-4 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-block h-px w-7 bg-warn shadow-[0_0_12px_rgb(var(--yellow)/0.28)]"
          />
          poker night settlement · {VERSION_LABEL}
        </p>
        <h2 className="font-serif font-[580] text-[44px] sm:text-[64px] leading-[0.98] tracking-[-0.026em] text-balance max-w-[17ch]">
          Settle the night in the{' '}
          <em className="font-[450] text-fg-dim">fewest possible</em> payments.
        </h2>
        <p className="mt-5 prose-panel text-fg-dim text-[16px] sm:text-[17px] max-w-[46ch]">
          Paste the PokerNow URL, fold duplicate players, record cash that changed hands, set
          private settlement rules — then finalize to mint a shareable link your group can mark off
          as they pay.
        </p>
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
        {/* URL input */}
        <form onSubmit={handleAnalyze} className="card flex h-full flex-col">
          <div className="flex flex-1 flex-col gap-4 p-5 sm:p-6">
            <span className="ticker-label-strong">paste game url</span>
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
              className="field font-mono text-[14px]"
              aria-invalid={error ? 'true' : 'false'}
              aria-describedby={error ? 'game-url-error' : undefined}
            />

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
          <div className="flex flex-1 flex-col gap-4 p-5 sm:p-6">
            <span className="ticker-label-strong">live game</span>
            <p className="text-[13px] text-fg-dim leading-relaxed">
              No PokerNow? Start a shareable live table, record buy-ins and cashouts as they
              happen, then finalize into the same settlement page.
            </p>
            <button
              type="button"
              onClick={onStartLiveGame}
              disabled={isLoading}
              className="btn mt-auto h-12 w-full text-[13px]"
            >
              {startingLive ? 'starting…' : 'start live game ›'}
            </button>
          </div>
        </section>
      </div>

      <RecentGamesPanel onOpenLedger={onAnalyze} />

      {/* Three-up feature row */}
      <div className="mt-8 grid sm:grid-cols-3 gap-3">
        {RULES.map((r, i) => (
          <div key={r.title} className="card p-5">
            <p className="ticker-label mb-3 flex items-center gap-2.5">
              <span className="num text-fg-mute normal-case tracking-normal">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span aria-hidden="true" className="inline-block h-px w-4 bg-line-strong" />
              {r.tag}
            </p>
            <h3 className="font-serif font-[600] text-[17px] mb-1.5 leading-snug tracking-[-0.01em]">
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
