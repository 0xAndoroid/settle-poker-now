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
      className="lg:hidden sticky top-0 z-20 bg-paper border-b-2 border-ink"
    >
      <div className="mx-auto max-w-5xl px-5 sm:px-8 flex border-l-2 border-r-2 border-paper">
        {tabs.map((t, i) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active === t.key}
            onClick={() => onChange(t.key)}
            className={cn(
              'flex-1 min-h-[48px] py-3 font-mono text-[11px] font-extrabold uppercase tracking-masthead',
              'border-ink relative',
              i > 0 && 'border-l-2',
              active === t.key
                ? 'bg-ink text-paper'
                : 'text-ink-2 hover:bg-paper-2'
            )}
          >
            <span className="inline-flex items-baseline gap-2">
              <span>{t.label}</span>
              {t.badge !== null && (
                <span className="font-mono tabular-nums text-[10px]">
                  [{t.badge}]
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
