import { useState, type FormEvent } from 'react';
import { extractGameId } from '@/lib/pokernow';

interface EmptyStateProps {
  onSubmit: (gameId: string) => void;
  loading?: boolean;
}

const PLACEHOLDER = 'pokernow.club/games/abc123';

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
    <div className="mx-auto max-w-3xl px-5 sm:px-8 py-10 sm:py-14">
      {/* Slab 1: lede */}
      <div className="slab">
        <div className="px-6 py-8 sm:px-10 sm:py-12">
          <h2 className="font-mono font-extrabold text-balance text-[34px] sm:text-[52px] leading-[0.95] tracking-tight">
            settle the night
            <br />
            in the fewest
            <br />
            possible payments.
          </h2>
          <p className="mt-6 max-w-[44ch] text-[14px] sm:text-[15px] leading-relaxed text-ink-2">
            Greedy debt simplification. Player groups optional. State lives in
            the URL hash, no accounts. Plan exports as a printable receipt.
          </p>
        </div>

        {/* Form section, separated by a heavy rule */}
        <div className="border-t-[3px] border-ink bg-paper-2">
          <form onSubmit={handleSubmit} className="px-6 py-6 sm:px-10 sm:py-7">
            <label
              htmlFor="game-url"
              className="block text-[10px] uppercase tracking-masthead font-bold mb-2"
            >
              game url
            </label>
            <div className="flex items-end gap-3 sm:gap-4">
              <span aria-hidden="true" className="font-mono text-ink/60 pb-3 select-none hidden sm:inline">
                &raquo;
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
                className="field flex-1 font-mono text-[14px] sm:text-[16px]"
                aria-invalid={error ? 'true' : 'false'}
                aria-describedby={error ? 'game-url-error' : undefined}
              />
              <button
                type="submit"
                disabled={loading || !value.trim()}
                className="btn btn-fill min-w-[128px]"
              >
                {loading ? '· · ·' : '[ settle › ]'}
              </button>
            </div>
            {error && (
              <p
                id="game-url-error"
                className="mt-3 text-[12px] uppercase tracking-all font-bold text-loss"
                role="alert"
              >
                ⚠ {error}
              </p>
            )}
            <div className="mt-5 flex items-center gap-3 text-[12px]">
              <span className="text-mute">no game handy?</span>
              <button
                type="button"
                onClick={() => onSubmit('demo')}
                disabled={loading}
                className="font-bold uppercase tracking-all underline underline-offset-4 decoration-2 hover:bg-ink hover:text-paper px-1"
              >
                run with demo data
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Three rules block — three "FAQ" entries laid out like an editorial sidebar */}
      <div className="mt-10 grid sm:grid-cols-3 gap-0 border-2 border-ink">
        {RULES.map((r, i) => (
          <div
            key={r.title}
            className={`p-5 ${
              i > 0 ? 'border-t-2 sm:border-t-0 sm:border-l-2 border-ink' : ''
            }`}
          >
            <p className="text-[10px] uppercase tracking-masthead font-bold text-mute mb-2">
              ¶ {String(i + 1).padStart(2, '0')}
            </p>
            <h3 className="font-mono font-extrabold text-[16px] mb-2 leading-tight">
              {r.title}
            </h3>
            <p className="text-[12.5px] leading-relaxed text-ink-2">{r.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const RULES: { title: string; body: string }[] = [
  {
    title: 'Min-transactions',
    body: 'Greedy max-creditor↔max-debtor. ≤ N−1 payments for N players, often fewer. Integer cents only — no float drift.',
  },
  {
    title: 'Isolated players',
    body: 'Mark "Andrew settles only with Kevin." Hub-and-spoke. Cycles get rejected with a clear error.',
  },
  {
    title: 'Print + share',
    body: 'Tap any payment to copy. Hit SHARE for a 4:5 receipt PNG — clipboard on desktop, native share sheet on mobile.',
  },
];
