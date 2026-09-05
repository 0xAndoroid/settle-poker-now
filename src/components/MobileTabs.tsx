import { cn } from '@/lib/cn';

export type EphemeralTabKey = 'ledger' | 'config';
export type PersistentTabKey = 'ledger' | 'mods' | 'payments' | 'history';
export type LiveTabKey = 'table' | 'bank' | 'payments' | 'log';

interface BaseTabsProps {
  playerCount: number;
}

interface EphemeralTabsProps extends BaseTabsProps {
  mode: 'ephemeral';
  active: EphemeralTabKey;
  onChange: (k: EphemeralTabKey) => void;
}

interface PersistentTabsProps extends BaseTabsProps {
  mode: 'persistent';
  active: PersistentTabKey;
  onChange: (k: PersistentTabKey) => void;
  txnCount: number;
  modsCount: number;
  historyCount: number;
}

interface LiveTabsProps {
  mode: 'live';
  active: LiveTabKey;
  onChange: (k: LiveTabKey) => void;
  playerCount: number;
  /** Recorded (non-voided) prior payments. */
  paymentsCount: number;
  /** Entries + chip checkpoints + audit rows, matching the activity feed. */
  logCount: number;
  /** True when the latest chip count disagrees with the tracked ledger. */
  bankAlert: boolean;
}

type MobileTabsProps = EphemeralTabsProps | PersistentTabsProps | LiveTabsProps;

interface TabSpec {
  key: string;
  label: string;
  badge: number | null;
  alert?: boolean;
}

export function MobileTabs(props: MobileTabsProps) {
  const tabs: TabSpec[] =
    props.mode === 'ephemeral'
      ? [
          {
            key: 'ledger',
            label: 'ledger',
            badge: props.playerCount > 0 ? props.playerCount : null,
          },
          { key: 'config', label: 'config', badge: null },
        ]
      : props.mode === 'persistent'
        ? [
            {
              key: 'ledger',
              label: 'ledger',
              badge: props.playerCount > 0 ? props.playerCount : null,
            },
            {
              key: 'mods',
              label: 'mods',
              badge: props.modsCount > 0 ? props.modsCount : null,
            },
            {
              key: 'payments',
              label: 'payments',
              badge: props.txnCount > 0 ? props.txnCount : null,
            },
            {
              key: 'history',
              label: 'history',
              badge: props.historyCount > 0 ? props.historyCount : null,
            },
          ]
        : [
            {
              key: 'table',
              label: 'table',
              badge: props.playerCount > 0 ? props.playerCount : null,
            },
            { key: 'bank', label: 'bank', badge: null, alert: props.bankAlert },
            {
              key: 'payments',
              label: 'payments',
              badge: props.paymentsCount > 0 ? props.paymentsCount : null,
            },
            {
              key: 'log',
              label: 'log',
              badge: props.logCount > 0 ? props.logCount : null,
            },
          ];

  const onChange = (key: string) => {
    if (props.mode === 'ephemeral') {
      props.onChange(key as EphemeralTabKey);
    } else if (props.mode === 'persistent') {
      props.onChange(key as PersistentTabKey);
    } else {
      props.onChange(key as LiveTabKey);
    }
  };

  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.key === props.active)
  );

  return (
    <div className="lg:hidden sticky top-[90px] z-20 bg-bg border-b border-line">
      <div className="mx-auto max-w-6xl px-3 sm:px-6 py-2">
        <div
          role="tablist"
          aria-label="Switch sections"
          className="relative flex rounded-[8px] border border-line bg-surface-soft p-1"
        >
          <span
            aria-hidden="true"
            className="absolute inset-y-1 rounded-[6px] bg-[rgb(var(--hairline)/0.13)] transition-transform duration-[420ms] [transition-timing-function:var(--spring)] will-change-transform"
            style={{
              width: `calc((100% - 8px) / ${tabs.length})`,
              transform: `translateX(${activeIndex * 100}%)`,
            }}
          />
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={props.active === t.key}
              onClick={() => onChange(t.key)}
              className={cn(
                'relative z-10 flex-1 min-h-[40px] px-1 font-sans text-[11px] font-bold uppercase tracking-ticker rounded-[6px] transition-colors duration-200',
                props.active === t.key ? 'text-fg' : 'text-fg-mute hover:text-fg-dim'
              )}
            >
              <span className="inline-flex items-baseline gap-1.5">
                <span>{t.label}</span>
                {t.badge !== null && (
                  <span
                    className={cn(
                      'num text-[10px] font-semibold transition-colors duration-200',
                      props.active === t.key ? 'text-fg-dim' : 'text-fg-mute/70'
                    )}
                  >
                    {t.badge}
                  </span>
                )}
                {t.alert === true && (
                  <span
                    aria-label="needs attention"
                    className="self-center h-1.5 w-1.5 rounded-full bg-loss"
                  />
                )}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
