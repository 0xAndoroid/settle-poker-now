import { forwardRef } from 'react';
import { formatDollars } from '@/lib/money';
import type { EffectiveBalance, SettlementPlan } from '@/lib/types';

interface ShareCardProps {
  plan: SettlementPlan;
  balances: EffectiveBalance[];
  /** Date string already formatted for display. */
  dateLabel?: string;
}

/**
 * 4:5 share card rendered into the DOM (off-screen) and captured by
 * html-to-image. Looks like a printed cashout receipt: cream paper, black
 * ink, dotted dividers, serrated bottom edge. No icons, no gradients —
 * pure typography. Optimized for thumbnail-size readability (Telegram /
 * iMessage previews).
 */
export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(function ShareCard(
  { plan, balances, dateLabel },
  ref
) {
  const nameById = new Map(balances.map((b) => [b.playerId, b.nickname]));
  const playerCount = balances.length;
  const txnCount = plan.txns.length;
  const totalSettled = plan.txns.reduce((acc, t) => acc + t.amountCents, 0);

  // Composition: 1080×1350 (4:5) at @2x. Use a fixed pixel canvas so
  // typography scales identically across devices.
  return (
    <div
      ref={ref}
      style={{
        width: 1080,
        minHeight: 1350,
        background: '#faf6ed',
        color: '#141414',
        fontFamily:
          '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        boxSizing: 'border-box',
        position: 'relative',
        padding: '0 64px',
        // Faint horizontal ledger lines for paper texture.
        backgroundImage:
          'repeating-linear-gradient(to bottom, transparent 0, transparent 47px, rgba(20,20,20,0.05) 47px, rgba(20,20,20,0.05) 48px)',
      }}
    >
      {/* Top serrated edge — drawn as a stack of triangles via SVG */}
      <SerratedEdge orientation="top" />

      {/* Inner content */}
      <div style={{ paddingTop: 56, paddingBottom: 56 }}>
        {/* Masthead */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            paddingBottom: 12,
            borderBottom: '1px solid rgba(20,20,20,0.4)',
            fontSize: 16,
            textTransform: 'uppercase',
            letterSpacing: '0.18em',
            fontWeight: 700,
            color: '#6b665e',
          }}
        >
          <span>vol. i &middot; no. 01</span>
          <span>poker night cashout</span>
        </div>
        <div
          style={{
            paddingTop: 10,
            paddingBottom: 24,
            borderBottom: '4px solid #141414',
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 76,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              lineHeight: 1,
            }}
          >
            settle<span style={{ color: '#6b665e' }}>.</span>andrew
            <span style={{ color: '#6b665e' }}>.</span>ee
          </h1>
        </div>

        {/* Stats row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            paddingTop: 28,
            paddingBottom: 28,
            borderBottom: '2px solid #141414',
          }}
        >
          <Stat label="players" value={String(playerCount)} />
          <Stat label="payments" value={String(txnCount)} />
          <Stat label="total moved" value={formatDollars(totalSettled)} mono />
        </div>

        {/* Section heading */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            paddingTop: 36,
            paddingBottom: 12,
          }}
        >
          <span
            style={{
              fontSize: 16,
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
              fontWeight: 800,
            }}
          >
            payments due
          </span>
          {dateLabel && (
            <span
              style={{
                fontSize: 14,
                textTransform: 'uppercase',
                letterSpacing: '0.18em',
                color: '#6b665e',
              }}
            >
              {dateLabel}
            </span>
          )}
        </div>
        <DottedRule />

        {/* Line items */}
        <div style={{ marginTop: 8 }}>
          {plan.txns.length === 0 ? (
            <div
              style={{
                padding: '36px 0',
                textAlign: 'center',
                fontSize: 24,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.18em',
              }}
            >
              already settled.
            </div>
          ) : (
            plan.txns.map((t, i) => (
              <div key={i}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 24,
                    padding: '16px 0',
                  }}
                >
                  <span
                    style={{
                      fontSize: 18,
                      color: '#6b665e',
                      width: 32,
                      flexShrink: 0,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      fontSize: 26,
                      fontWeight: 700,
                      lineHeight: 1.15,
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 14,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span
                      style={{
                        textDecoration: 'underline',
                        textDecorationColor: '#a8201a',
                        textDecorationThickness: 2,
                        textUnderlineOffset: 4,
                      }}
                    >
                      {nameById.get(t.fromId) ?? t.fromId}
                    </span>
                    <span style={{ color: '#6b665e' }}>→</span>
                    <span>{nameById.get(t.toId) ?? t.toId}</span>
                    {t.forced && (
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.18em',
                          color: '#6b665e',
                          border: '1px solid #6b665e',
                          padding: '2px 6px',
                          marginLeft: 6,
                        }}
                      >
                        isolated
                      </span>
                    )}
                  </span>
                  <span
                    style={{
                      fontSize: 30,
                      fontWeight: 800,
                      fontVariantNumeric: 'tabular-nums',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatDollars(t.amountCents)}
                  </span>
                </div>
                {i < plan.txns.length - 1 && <DottedRule />}
              </div>
            ))
          )}
        </div>

        <div style={{ borderTop: '4px solid #141414', marginTop: 8, paddingTop: 28 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
            }}
          >
            <span
              style={{
                fontSize: 18,
                textTransform: 'uppercase',
                letterSpacing: '0.18em',
                fontWeight: 800,
              }}
            >
              total
            </span>
            <span
              style={{
                fontSize: 44,
                fontWeight: 800,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatDollars(totalSettled)}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 56 }}>
          <DottedRule />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: 18,
              fontSize: 14,
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
              color: '#6b665e',
              fontWeight: 700,
            }}
          >
            <span>thank you · come again</span>
            <span style={{ color: '#141414' }}>▪ settle.andrew.ee ▪</span>
          </div>
        </div>
      </div>

      {/* Bottom serrated edge */}
      <SerratedEdge orientation="bottom" />
    </div>
  );
});

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div
        style={{
          fontSize: 13,
          textTransform: 'uppercase',
          letterSpacing: '0.18em',
          color: '#6b665e',
          fontWeight: 700,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 38,
          fontWeight: 800,
          fontVariantNumeric: mono ? 'tabular-nums' : 'normal',
          letterSpacing: '-0.01em',
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function DottedRule() {
  return (
    <div
      style={{
        height: 1,
        background:
          'radial-gradient(circle, #141414 1px, transparent 1.6px) repeat-x center',
        backgroundSize: '8px 1px',
      }}
    />
  );
}

function SerratedEdge({ orientation }: { orientation: 'top' | 'bottom' }) {
  // 60 teeth across 1080px = 18px per tooth.
  const teeth = 60;
  const w = 1080 / teeth;
  const path: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const x0 = i * w;
    const x1 = x0 + w / 2;
    const x2 = x0 + w;
    if (orientation === 'top') {
      path.push(`M${x0},14 L${x1},0 L${x2},14`);
    } else {
      path.push(`M${x0},0 L${x1},14 L${x2},0`);
    }
  }
  const d = path.join(' ');

  return (
    <svg
      viewBox="0 0 1080 14"
      width={1080}
      height={14}
      style={{
        display: 'block',
        position: 'absolute',
        left: 0,
        right: 0,
        [orientation]: 0,
      }}
      aria-hidden="true"
    >
      <path d={d} fill="#faf6ed" />
    </svg>
  );
}
