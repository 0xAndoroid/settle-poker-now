import { forwardRef } from 'react';
import { formatDollars } from '@/lib/money';
import type { EffectiveBalance, Group, SettlementPlan } from '@/lib/types';

interface ShareCardProps {
  plan: SettlementPlan;
  balances: EffectiveBalance[];
  groups: Group[];
  /** Optional title (e.g. "Friday game" or game id). */
  title?: string;
  /** Date string already formatted for display. */
  dateLabel?: string;
}

const GROUP_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

/**
 * Card optimized for thumbnail consumption (Instagram/Telegram previews).
 * Aspect ratio 4:5 → 1080×1350 at @2x ratio. Big monospace numbers, thick
 * gradient header, subtle attribution. Rendered into the DOM but positioned
 * off-screen until html-to-image captures it.
 */
export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(function ShareCard(
  { plan, balances, groups, title, dateLabel },
  ref
) {
  const nameById = new Map(balances.map((b) => [b.playerId, b.nickname]));
  const playerCount = balances.length;
  const txnCount = plan.txns.length;

  const totalSettled = plan.txns.reduce((acc, t) => acc + t.amountCents, 0);

  const groupLabel = (groupId: string): string => {
    if (groupId === 'all') return 'All players';
    const idx = groups.findIndex((g) => g.id === groupId);
    return idx >= 0 ? `Group ${GROUP_LABELS[idx] ?? '?'}` : 'Group';
  };

  return (
    <div
      ref={ref}
      style={{
        width: '1080px',
        // Tight 4:5 aspect ratio. min-height + auto growth keeps long settlement lists from being clipped.
        minHeight: '1350px',
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        background: '#0a0c14',
        color: '#f7f8fa',
        padding: '64px 72px 56px',
        display: 'flex',
        flexDirection: 'column',
        gap: '36px',
        boxSizing: 'border-box',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Ambient gradient backdrop */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at 8% -10%, rgba(124, 92, 255, 0.45), transparent 45%), radial-gradient(circle at 95% 110%, rgba(34, 197, 94, 0.28), transparent 55%)',
          pointerEvents: 'none',
        }}
      />

      {/* Header */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '14px',
              background: '#10131f',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
              <defs>
                <linearGradient id="sc-grad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#7c5cff" />
                  <stop offset="100%" stopColor="#22c55e" />
                </linearGradient>
              </defs>
              <path
                d="M9 21 L14 12 L18 18 L23 9"
                stroke="url(#sc-grad)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <circle cx="9" cy="21" r="2.2" fill="#7c5cff" />
              <circle cx="23" cy="9" r="2.2" fill="#22c55e" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}>
              <span style={{ color: '#f7f8fa' }}>settle.</span>
              <span style={{ color: '#a48bff' }}>poker</span>
            </div>
            <div style={{ fontSize: '14px', color: '#8d97ab', marginTop: '4px', letterSpacing: '0.02em' }}>
              Minimum-payment settlement
            </div>
          </div>
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 14px',
            borderRadius: '999px',
            background: 'rgba(124, 92, 255, 0.15)',
            border: '1px solid rgba(124, 92, 255, 0.35)',
            fontSize: '13px',
            fontWeight: 600,
            color: '#c4b5fd',
            letterSpacing: '0.02em',
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '999px',
              background: '#a48bff',
            }}
          />
          PokerNow
        </div>
      </div>

      {/* Title block */}
      <div style={{ position: 'relative' }}>
        <h1
          style={{
            fontSize: '52px',
            fontWeight: 700,
            letterSpacing: '-0.025em',
            lineHeight: 1.05,
            margin: 0,
          }}
        >
          {title ?? 'Settlement plan'}
        </h1>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            marginTop: '14px',
            color: '#bcc3d0',
            fontSize: '17px',
            fontWeight: 500,
          }}
        >
          {dateLabel && <span>{dateLabel}</span>}
          {dateLabel && <span style={{ color: '#414b65' }}>·</span>}
          <span>
            {playerCount} player{playerCount === 1 ? '' : 's'}
          </span>
          <span style={{ color: '#414b65' }}>·</span>
          <span>
            {txnCount} payment{txnCount === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {/* Plan content */}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '28px', flex: 1 }}>
        {plan.groups.map((group) => (
          <div
            key={group.groupId}
            style={{
              borderRadius: '20px',
              background: 'rgba(29, 34, 55, 0.7)',
              border: '1px solid rgba(45, 53, 80, 0.8)',
              padding: '24px 28px',
            }}
          >
            {plan.groups.length > 1 && (
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: '#a48bff',
                  textTransform: 'uppercase',
                  marginBottom: '16px',
                }}
              >
                {groupLabel(group.groupId)}
              </div>
            )}

            {group.txns.length === 0 ? (
              <div style={{ fontSize: '20px', color: '#8d97ab', fontStyle: 'italic' }}>
                {group.isImbalanced
                  ? `Cannot settle — off by ${formatDollars(group.imbalanceCents)}`
                  : 'Already settled.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {group.txns.map((t, i) => (
                  <div
                    key={`${group.groupId}-${i}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '24px',
                      padding: '14px 0',
                      borderBottom:
                        i < group.txns.length - 1
                          ? '1px dashed rgba(65, 75, 101, 0.5)'
                          : 'none',
                    }}
                  >
                    <div
                      style={{
                        fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
                        fontSize: '24px',
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      <span style={{ color: '#fca5a5', fontWeight: 600 }}>
                        {nameById.get(t.fromId) ?? t.fromId}
                      </span>
                      <span style={{ color: '#5d6883', fontSize: '20px' }}>→</span>
                      <span style={{ color: '#86efac', fontWeight: 600 }}>
                        {nameById.get(t.toId) ?? t.toId}
                      </span>
                    </div>
                    <div
                      style={{
                        fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
                        fontSize: '28px',
                        fontWeight: 700,
                        color: '#f7f8fa',
                        whiteSpace: 'nowrap',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {formatDollars(t.amountCents)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          paddingTop: '24px',
          borderTop: '1px solid rgba(45, 53, 80, 0.6)',
        }}
      >
        <div>
          <div style={{ fontSize: '13px', color: '#5d6883', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
            Total moved
          </div>
          <div
            style={{
              fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: '36px',
              fontWeight: 700,
              color: '#f7f8fa',
              fontVariantNumeric: 'tabular-nums',
              marginTop: '4px',
            }}
          >
            {formatDollars(totalSettled)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '13px', color: '#5d6883', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
            Made with
          </div>
          <div
            style={{
              fontSize: '20px',
              fontWeight: 600,
              color: '#bcc3d0',
              marginTop: '4px',
              letterSpacing: '-0.01em',
            }}
          >
            settle-poker-now.pages.dev
          </div>
        </div>
      </div>
    </div>
  );
});
