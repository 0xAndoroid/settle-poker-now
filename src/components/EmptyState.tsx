import { useState, type FormEvent } from 'react';
import { extractGameId } from '@/lib/pokernow';

interface EmptyStateProps {
  onSubmit: (gameId: string) => void;
  loading?: boolean;
}

const PLACEHOLDER = 'https://www.pokernow.club/games/abc123';

export function EmptyState({ onSubmit, loading = false }: EmptyStateProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const gameId = extractGameId(value);
    if (!gameId) {
      setError('That doesn’t look like a PokerNow game URL. Try the full URL.');
      return;
    }
    setError(null);
    onSubmit(gameId);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 pt-12 sm:pt-20 pb-24 animate-slide-up">
      <div className="text-center mb-8 sm:mb-10">
        <div className="inline-flex items-center gap-2 pill bg-accent/10 text-accent mb-5 border border-accent/20">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-soft" />
          PokerNow settlement, simplified
        </div>
        <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-balance leading-[1.05] mb-4">
          Settle your home game in the <span className="text-accent">fewest</span> payments.
        </h1>
        <p className="text-[var(--fg-dim)] text-base sm:text-lg max-w-xl mx-auto text-balance">
          Paste your PokerNow game URL. We&apos;ll fetch the ledger, compute the
          minimum-transaction settlement, and give you a copyable plan.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <label htmlFor="game-url" className="sr-only">
          PokerNow game URL
        </label>
        <div className="relative">
          <input
            id="game-url"
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
            className="input-field pr-32 sm:pr-36 font-mono text-[13px] sm:text-sm"
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? 'game-url-error' : undefined}
          />
          <button
            type="submit"
            disabled={loading || !value.trim()}
            className="btn-primary absolute right-1.5 top-1/2 -translate-y-1/2 px-4 py-2 min-h-0 h-[40px] text-sm"
          >
            {loading ? (
              <>
                <Spinner />
                <span className="hidden sm:inline">Loading</span>
              </>
            ) : (
              <>
                <span>Settle</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </>
            )}
          </button>
        </div>
        {error && (
          <p
            id="game-url-error"
            className="text-sm text-loss flex items-start gap-1.5 animate-fade-in"
            role="alert"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </p>
        )}
        <div className="text-center">
          <button
            type="button"
            onClick={() => onSubmit('demo')}
            disabled={loading}
            className="text-[13px] text-[var(--fg-mute)] hover:text-accent transition-colors underline-offset-4 hover:underline"
          >
            or try with demo data →
          </button>
        </div>
      </form>

      <FeatureGrid />
    </div>
  );
}

function Spinner() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      className="animate-spin"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function FeatureGrid() {
  return (
    <div className="mt-12 grid sm:grid-cols-3 gap-3">
      {FEATURES.map((f) => (
        <div
          key={f.title}
          className="surface rounded-2xl p-4 hover:border-[var(--border-strong)] transition-colors"
        >
          <div className="text-accent mb-2.5">{f.icon}</div>
          <h3 className="font-medium text-[15px] mb-1">{f.title}</h3>
          <p className="text-[13px] text-[var(--fg-dim)] leading-relaxed">{f.desc}</p>
        </div>
      ))}
    </div>
  );
}

const FEATURES: { title: string; desc: string; icon: React.ReactNode }[] = [
  {
    title: 'Min-transaction algo',
    desc: 'Greedy debt simplification matches the biggest winner with the biggest loser, repeatedly.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    title: 'Group constraints',
    desc: 'Friends pay friends. Partition players into groups so settlements stay within trusted circles.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="8.5" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M17 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    title: 'Share as image',
    desc: 'One tap → branded settlement card to AirDrop, Telegram, or Messages. Looks great in previews.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
      </svg>
    ),
  },
];
