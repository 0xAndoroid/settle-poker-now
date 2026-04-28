import { cn } from '@/lib/cn';

export type TabKey = 'plan' | 'ledger' | 'config';

interface MobileTabsProps {
  active: TabKey;
  onChange: (k: TabKey) => void;
  txnCount: number;
  playerCount: number;
}

export function MobileTabs({ active, onChange, txnCount, playerCount }: MobileTabsProps) {
  const tabs: { key: TabKey; label: string; badge: number | null }[] = [
    { key: 'plan', label: 'Plan', badge: txnCount > 0 ? txnCount : null },
    { key: 'ledger', label: 'Ledger', badge: playerCount > 0 ? playerCount : null },
    { key: 'config', label: 'Configure', badge: null },
  ];

  return (
    <div
      role="tablist"
      aria-label="Switch between plan, ledger and configuration"
      className="lg:hidden sticky top-[57px] z-20 bg-[var(--bg)]/85 backdrop-blur-md border-b border-[var(--border)]"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 flex">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active === t.key}
            onClick={() => onChange(t.key)}
            className={cn(
              'flex-1 min-h-[48px] py-3 text-sm font-medium relative transition-colors',
              active === t.key
                ? 'text-[var(--fg)]'
                : 'text-[var(--fg-mute)] hover:text-[var(--fg-dim)]'
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              {t.label}
              {t.badge !== null && (
                <span
                  className={cn(
                    'pill border h-5 px-1.5 min-w-[20px] justify-center',
                    active === t.key
                      ? 'bg-accent/15 text-accent border-accent/30'
                      : 'bg-[var(--bg-elev-2)] text-[var(--fg-mute)] border-[var(--border)]'
                  )}
                >
                  {t.badge}
                </span>
              )}
            </span>
            {active === t.key && (
              <span
                aria-hidden="true"
                className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-12 bg-accent rounded-full"
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
