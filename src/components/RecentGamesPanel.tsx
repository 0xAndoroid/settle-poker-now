import { navigate } from '@/lib/routing';
import type { RecentGameEntry, RecentGameStatus } from '@/lib/recentGames';
import { useRecentGames } from '@/hooks/useRecentGames';

export function RecentGamesPanel() {
  const { entries, remove } = useRecentGames();
  if (entries.length === 0) return null;

  return (
    <section className="card mt-5 overflow-hidden" aria-labelledby="recent-games-title">
      <div className="card-header">
        <div>
          <span id="recent-games-title" className="ticker-label-strong">
            recent games
          </span>
          <p className="mt-1 text-[12px] text-fg-mute">saved on this browser</p>
        </div>
        <span className="ticker-label">{entries.length}/50</span>
      </div>

      <div className="divide-y divide-line">
        {entries.map((entry) => (
          <article
            key={`${entry.kind}:${entry.id}`}
            className="group flex items-center gap-3 px-4 py-3 transition-colors duration-200 hover:bg-fill-1 sm:px-5"
          >
            <button
              type="button"
              onClick={() => navigate(entry.path)}
              className="min-w-0 flex-1 text-left"
              aria-label={`Open ${entry.label}`}
            >
              <div className="mb-1.5 flex min-w-0 items-center gap-2">
                <span className="truncate font-sans text-[14px] font-semibold tracking-tight-2 text-fg">
                  {entry.label}
                </span>
                <StatusBadge entry={entry} />
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-fg-mute">
                <span className="font-mono">{entrySlug(entry)}</span>
                <span aria-hidden="true">/</span>
                <span>
                  {entry.missingAt
                    ? 'unavailable on last open'
                    : formatVisitedAt(entry.lastVisitedAt)}
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => remove(entry.kind, entry.id)}
              className="btn btn-ghost shrink-0 opacity-70 transition-opacity group-hover:opacity-100"
              aria-label={`Remove ${entry.label} from recent games`}
            >
              remove
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function StatusBadge({ entry }: { entry: RecentGameEntry }) {
  if (entry.missingAt) return <span className="pill pill-loss shrink-0">missing</span>;
  return <span className={`pill ${statusClass(entry.status)} shrink-0`}>{entry.status}</span>;
}

function statusClass(status: RecentGameStatus): string {
  if (status === 'finalized') return 'pill-gain';
  if (status === 'active') return 'pill-live';
  return '';
}

function entrySlug(entry: RecentGameEntry): string {
  if (entry.kind === 'game') return `/g/${entry.id}`;
  if (entry.kind === 'live') return `/live/${entry.id}`;
  return `ledger/${entry.id}`;
}

function formatVisitedAt(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return 'recently';
  const delta = Math.max(0, Date.now() - ms);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (delta < minute) return 'just now';
  if (delta < hour) return `${Math.floor(delta / minute)}m ago`;
  if (delta < day) return `${Math.floor(delta / hour)}h ago`;

  const date = new Date(ms);
  const now = new Date();
  const options: Intl.DateTimeFormatOptions =
    date.getFullYear() === now.getFullYear()
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' };
  return new Intl.DateTimeFormat(undefined, options).format(date);
}
