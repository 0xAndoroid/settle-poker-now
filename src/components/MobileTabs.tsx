import { cn } from '@/lib/cn';

/**
 * Tab key namespaces. Each mode has its own tab set:
 *   - `ephemeral` (pre-finalize edit view): LEDGER · CONFIG.
 *     The settlement plan rides under `ledger` so the user can see their
 *     work without losing the editing affordances on the same screen.
 *   - `persistent` (post-finalize read-only view): LEDGER · MODS · PAYMENTS · HISTORY.
 *   - `live` (live game workflow): PLAYERS · BANK · ACTIVITY · FINALIZE.
 */
export type EphemeralTabKey = 'ledger' | 'config';
export type PersistentTabKey = 'ledger' | 'mods' | 'payments' | 'history';
export type LiveTabKey = 'players' | 'bank' | 'activity' | 'finalize';

interface BaseTabsProps {
  txnCount: number;
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
  modsCount: number;
  historyCount: number;
}

interface LiveTabsProps extends BaseTabsProps {
  mode: 'live';
  active: LiveTabKey;
  onChange: (k: LiveTabKey) => void;
  bankIssueCount: number;
  historyCount: number;
  pendingCount: number;
}

type MobileTabsProps = EphemeralTabsProps | PersistentTabsProps | LiveTabsProps;

interface TabSpec {
  key: string;
  label: string;
  badge: number | null;
}

export function MobileTabs(props: MobileTabsProps) {
  const tabs: TabSpec[] = props.mode === 'ephemeral'
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
          key: 'players',
          label: 'players',
          badge: props.playerCount > 0 ? props.playerCount : null,
        },
        {
          key: 'bank',
          label: 'bank',
          badge: props.bankIssueCount > 0 ? props.bankIssueCount : null,
        },
        {
          key: 'activity',
          label: 'activity',
          badge:
            props.pendingCount > 0
              ? props.pendingCount
              : props.historyCount > 0
                ? props.historyCount
                : null,
        },
        {
          key: 'finalize',
          label: 'final',
          badge: props.txnCount > 0 ? props.txnCount : null,
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
            aria-selected={props.active === t.key}
            onClick={() => onChange(t.key)}
            className={cn(
              'flex-1 min-h-[44px] py-2.5 font-sans text-[11px] font-bold uppercase tracking-ticker relative',
              props.active === t.key
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
            {props.active === t.key && (
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
