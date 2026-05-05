import { forwardRef } from 'react';
import { formatDollars } from '@/lib/money';
import { orderPaymentsBySenderTotal } from '@/lib/paymentOrdering';
import type { EffectiveBalance, SettlementPlan } from '@/lib/types';

interface ShareCardProps {
  plan: SettlementPlan;
  balances: EffectiveBalance[];
  /** Date string already formatted for display. */
  dateLabel?: string;
}

/**
 * 4:5 export card (1080×1350) optimized for chat-app preview thumbnails.
 * Trading-terminal dark variant: charcoal bg, magenta brand, strict
 * gain/loss color coding, dense JetBrains Mono numerics. Always dark
 * regardless of app theme — most chat apps render previews on dark
 * backgrounds and a card that consistently reads "trading P&L statement"
 * is the brand surface.
 */
export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(function ShareCard(
  { plan, balances, dateLabel },
  ref
) {
  const nameById = new Map(balances.map((b) => [b.playerId, b.nickname]));
  const playerCount = balances.length;
  const txnCount = plan.txns.length;
  const totalSettled = plan.txns.reduce((acc, t) => acc + t.amountCents, 0);
  const orderedPayments = orderPaymentsBySenderTotal(plan.txns);

  const TXN_FONT_SIZE = pickTxnFontSize(plan.txns.length);

  return (
    <div
      ref={ref}
      style={{
        width: 1080,
        minHeight: 1350,
        background: '#0a0a0c',
        color: '#ededf2',
        fontFamily:
          '"Inter Tight", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        boxSizing: 'border-box',
        position: 'relative',
        padding: '64px 64px 56px',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        // Subtle dot grid background — same as the app body, just denser.
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)',
        backgroundSize: '32px 32px',
      }}
    >
      {/* Top row: brand + status pill */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: 20,
          borderBottom: '1px solid #25252f',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Brandmark size={48} />
          <div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: '-0.02em',
                lineHeight: 1,
              }}
            >
              settle<span style={{ color: '#5a5a6c', fontWeight: 400 }}>.</span>
              andrew<span style={{ color: '#5a5a6c', fontWeight: 400 }}>.</span>ee
            </div>
            <div
              style={{
                marginTop: 6,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: '#9595a8',
              }}
            >
              poker night settlement
            </div>
          </div>
        </div>
        <Pill tone="accent">
          <Dot size={6} color="#d946ef" />
          settled
        </Pill>
      </div>

      {/* Metric tape */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 0,
          padding: '32px 0',
          borderBottom: '1px solid #25252f',
        }}
      >
        <Metric label="players" value={String(playerCount)} />
        <Metric label="payments" value={String(txnCount)} />
        <Metric
          label="total moved"
          value={formatDollars(totalSettled)}
          mono
        />
      </div>

      {/* Section heading */}
      <div
        style={{
          paddingTop: 32,
          paddingBottom: 14,
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#ededf2',
          }}
        >
          payments
        </span>
        {dateLabel && (
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: '#9595a8',
            }}
          >
            {dateLabel}
          </span>
        )}
      </div>

      {/* Line items — flex grow to push the footer down */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
          fontVariantNumeric: 'tabular-nums lining-nums',
        }}
      >
        {plan.txns.length === 0 ? (
          <div
            style={{
              padding: '64px 0',
              textAlign: 'center',
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: '#9595a8',
            }}
          >
            already settled.
          </div>
        ) : (
          orderedPayments.map(({ payment: t }, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 24,
                padding: '14px 0',
                borderBottom:
                  i < orderedPayments.length - 1
                    ? '1px solid rgba(37,37,47,0.7)'
                    : 'none',
              }}
            >
              <span
                style={{
                  fontSize: 16,
                  color: '#5a5a6c',
                  width: 36,
                  flexShrink: 0,
                }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <span
                style={{
                  flex: 1,
                  fontSize: TXN_FONT_SIZE,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 14,
                  flexWrap: 'wrap',
                  letterSpacing: '-0.01em',
                }}
              >
                <span style={{ color: '#ff3645' }}>
                  {nameById.get(t.fromId) ?? t.fromId}
                </span>
                <span style={{ color: '#5a5a6c' }}>↦</span>
                <span style={{ color: '#00d4a8' }}>
                  {nameById.get(t.toId) ?? t.toId}
                </span>
                {t.forced && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      color: '#d946ef',
                      border: '1px solid rgba(217,70,239,0.4)',
                      background: 'rgba(217,70,239,0.14)',
                      padding: '2px 8px',
                      marginLeft: 4,
                    }}
                  >
                    isolated
                  </span>
                )}
              </span>
              <span
                style={{
                  fontSize: TXN_FONT_SIZE + 4,
                  fontWeight: 700,
                  color: '#ededf2',
                  whiteSpace: 'nowrap',
                  letterSpacing: '-0.01em',
                }}
              >
                {formatDollars(t.amountCents)}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Total bar */}
      {plan.txns.length > 0 && (
        <div
          style={{
            marginTop: 24,
            padding: '20px 0',
            borderTop: '1px solid #3a3a4a',
            borderBottom: '1px solid #25252f',
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: '#9595a8',
            }}
          >
            total moved
          </span>
          <span
            style={{
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              fontSize: 44,
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums lining-nums',
              color: '#ededf2',
              letterSpacing: '-0.01em',
            }}
          >
            {formatDollars(totalSettled)}
          </span>
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          marginTop: 22,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: '#5a5a6c',
        }}
      >
        <span>printed via settle.andrew.ee</span>
        <span style={{ color: '#d946ef' }}>● live</span>
      </div>
    </div>
  );
});

function pickTxnFontSize(count: number): number {
  if (count <= 4) return 30;
  if (count <= 6) return 26;
  if (count <= 9) return 22;
  return 19;
}

function Brandmark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      style={{ display: 'block' }}
      aria-hidden="true"
    >
      <rect x="2" y="2" width="28" height="28" fill="none" stroke="#3a3a4a" strokeWidth="1" />
      <path
        d="M5 22 L11 14 L16 18 L21 11 L27 8"
        stroke="#d946ef"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="11" cy="14" r="1.8" fill="#00d4a8" />
      <circle cx="21" cy="11" r="1.8" fill="#ff3645" />
    </svg>
  );
}

function Metric({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: '#9595a8',
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: mono
            ? '"JetBrains Mono", ui-monospace, monospace'
            : '"Inter Tight", Inter, system-ui, sans-serif',
          fontSize: 40,
          fontWeight: 700,
          fontVariantNumeric: mono ? 'tabular-nums lining-nums' : 'normal',
          letterSpacing: '-0.02em',
          lineHeight: 1,
          color: '#ededf2',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone: 'accent' }) {
  const colors =
    tone === 'accent'
      ? {
          bg: 'rgba(217,70,239,0.14)',
          border: 'rgba(217,70,239,0.4)',
          fg: '#d946ef',
        }
      : { bg: 'transparent', border: '#3a3a4a', fg: '#9595a8' };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        color: colors.fg,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </span>
  );
}

function Dot({ size, color }: { size: number; color: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: 999,
        background: color,
      }}
    />
  );
}
