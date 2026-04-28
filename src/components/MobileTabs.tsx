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
    { key: 'plan', label: 'payments', badge: txnCount > 0 ? txnCount : null },
    { key: 'ledger', label: 'ledger', badge: playerCount > 0 ? playerCount : null },
    { key: 'config', label: 'rules', badge: null },
  ];

  return (
    <div
      role="tablist"
      aria-label="Switch sections"
      className="lg:hidden sticky top-12 z-20 bg-bg border-b border-line"
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
              'flex-1 min-h-[44px] py-2.5 font-sans text-[11px] font-bold uppercase tracking-ticker relative',
              active === t.key
                ? 'text-fg'
                : 'text-fg-mute hover:text-fg-dim'
            )}
          >
            <span className="inline-flex items-baseline gap-2">
              <span>{t.label}</span>
              {t.badge !== null && (
                <span className="font-mono num text-[10px] text-fg-mute">
                  [{t.badge}]
                </span>
              )}
            </span>
            {active === t.key && (
              <span
                aria-hidden="true"
                className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] w-12 bg-accent"
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
