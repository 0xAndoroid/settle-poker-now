import { useCallback, useMemo, useRef, useState } from 'react';
import { LedgerPanel } from './LedgerPanel';
import { SettlementPanel, type PaymentCompletion } from './SettlementPanel';
import { IsolationPanel } from './IsolationPanel';
import { AdjustmentsPanel } from './AdjustmentsPanel';
import { ShareCard } from './ShareCard';
import { IdentityPrompt } from './IdentityPrompt';
import { AuditLogPanel } from './AuditLogPanel';
import { MobileTabs, type TabKey } from './MobileTabs';
import type { TickerItem } from './Masthead';
import { usePersistentGame } from '@/hooks/usePersistentGame';
import { useGameIdentity } from '@/hooks/useGameIdentity';
import { gamePath } from '@/lib/routing';
import { copyText } from '@/lib/clipboard';
import { shareNodeAsImage } from '@/lib/shareImage';
import { formatDollars } from '@/lib/money';
import { projectSettlementPlan } from '@/lib/persistedProjection';
import type {
  EffectiveBalance,
  IsolationRule,
  LedgerRow,
  PersistedGameSnapshot,
  SettlementPlan,
} from '@/lib/types';

interface PersistentGameViewProps {
  gameId: string;
  onTickerChange: (ticker: TickerItem[] | undefined) => void;
  pushToast: (message: string, variant?: 'success' | 'error' | 'info') => void;
}

/**
 * Persistent game view at /g/:id. Owns:
 *   - Server snapshot fetch + polling (via `usePersistentGame`)
 *   - Identity selection per game (localStorage)
 *   - Mutations (mark complete, add/remove adjustment, set/clear isolation)
 *   - Tabbed mobile layout matching the ephemeral path
 */
export function PersistentGameView({
  gameId,
  onTickerChange,
  pushToast,
}: PersistentGameViewProps) {
  const { identity, setIdentity } = useGameIdentity(gameId);
  const actorLabel = identity?.nickname ?? null;

  const {
    state,
    togglePayment,
    addAdjustment,
    removeAdjustment,
    setIsolation,
    clearIsolation,
  } = usePersistentGame(gameId, actorLabel, {
    onError: (message) => pushToast(message, 'error'),
  });

  const [activeTab, setActiveTab] = useState<TabKey>('plan');
  const shareCardRef = useRef<HTMLDivElement | null>(null);

  // Project the persisted snapshot into the same shape the ephemeral
  // panels expect.
  const projection = useMemo(
    () => (state.game ? projectSnapshot(state.game) : null),
    [state.game]
  );

  // Push ticker updates upward whenever the snapshot changes.
  useMemo(() => {
    if (!projection || !state.game) {
      onTickerChange(undefined);
      return;
    }
    const settled = state.game.payments.filter(
      (p) => p.completedAt !== null
    ).length;
    const totalMoved = state.game.payments.reduce(
      (acc, p) => acc + p.amountCents,
      0
    );
    const ticker: TickerItem[] = [
      { label: 'players', value: String(state.game.players.length) },
      {
        label: 'settled',
        value: `${settled}/${state.game.payments.length}`,
        tone: 'gain',
      },
      { label: 'total', value: formatDollars(totalMoved) },
    ];
    onTickerChange(ticker);
  }, [onTickerChange, projection, state.game]);

  const handleCopyLink = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const fullUrl = `${window.location.origin}${gamePath(gameId)}`;
    const ok = await copyText(fullUrl);
    pushToast(
      ok
        ? 'link copied — paste in chat for a live preview'
        : 'could not copy link',
      ok ? 'success' : 'error'
    );
  }, [gameId, pushToast]);

  const handleShareImage = useCallback(async () => {
    if (!shareCardRef.current) {
      pushToast('share card not ready, try again', 'error');
      return;
    }
    const result = await shareNodeAsImage(shareCardRef.current, {
      filename: `settle-${gameId}.png`,
      title: 'settle.andrew.ee — settlement',
      text: 'Settlement plan from settle.andrew.ee',
    });
    switch (result.kind) {
      case 'shared':
        pushToast('shared.', 'success');
        break;
      case 'copied':
        pushToast('image copied — paste anywhere', 'success');
        break;
      case 'downloaded':
        pushToast('png downloaded', 'success');
        break;
      case 'cancelled':
        break;
      case 'failed':
        pushToast(result.detail ?? 'share failed', 'error');
        break;
    }
  }, [gameId, pushToast]);

  const handleAddAdjustment = useCallback(
    async (adj: { fromPlayerId: string; toPlayerId: string; amountCents: number }) => {
      try {
        await addAdjustment(adj);
      } catch (err) {
        pushToast((err as Error).message, 'error');
      }
    },
    [addAdjustment, pushToast]
  );

  const handleRemoveAdjustment = useCallback(
    async (adjustmentId: string) => {
      try {
        await removeAdjustment(adjustmentId);
      } catch (err) {
        pushToast((err as Error).message, 'error');
      }
    },
    [pushToast, removeAdjustment]
  );

  const handleIsolationChange = useCallback(
    async (rules: IsolationRule[]) => {
      const current = state.game?.isolations ?? [];
      try {
        // Diff current vs new and emit the right server calls.
        const incoming = new Map(rules.map((r) => [r.playerId, r.counterpartId]));
        const existing = new Map(
          current.map((r) => [r.playerId, r.counterpartId])
        );

        // Removals.
        for (const [playerId] of existing) {
          if (!incoming.has(playerId)) {
            await clearIsolation(playerId);
          }
        }
        // Adds + updates.
        for (const [playerId, counterpartId] of incoming) {
          if (existing.get(playerId) !== counterpartId) {
            await setIsolation({ playerId, counterpartId });
          }
        }
      } catch (err) {
        pushToast((err as Error).message, 'error');
      }
    },
    [clearIsolation, pushToast, setIsolation, state.game?.isolations]
  );

  if (state.status === 'loading' && !projection) {
    return <CenterMessage label="loading game" />;
  }
  if (state.status === 'error' || !projection) {
    return (
      <CenterMessage
        label="not found"
        body={state.error ?? `No persistent game with id "${gameId}".`}
      />
    );
  }

  const showIdentityPrompt = identity === null && !sessionDeclined();

  // Map current persisted plan ordering to txn list.
  const plan = projection.plan;
  const paymentIds: string[] = state.game!.payments.map((p) => p.id);
  const completionByPaymentId = new Map<string, PaymentCompletion>(
    state.game!.payments.map((p) => [
      p.id,
      { completedAt: p.completedAt, completedBy: p.completedBy },
    ])
  );

  return (
    <>
      <MobileTabs
        active={activeTab}
        onChange={setActiveTab}
        txnCount={plan.txns.length}
        playerCount={projection.balances.length}
      />

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8 pb-24">
        {showIdentityPrompt && (
          <div className="mb-6">
            <IdentityPrompt
              players={state.game!.players}
              onPick={(picked) => {
                if (picked) {
                  setIdentity(picked);
                  pushToast(`identified as ${picked.nickname}`, 'info');
                } else {
                  declineIdentity();
                  setIdentity(null);
                  pushToast('continuing as spectator', 'info');
                }
              }}
            />
          </div>
        )}

        <div className="hidden lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-6">
          <div className="space-y-5">
            <LedgerPanel
              rows={projection.rows}
              effectiveBalances={projection.balances}
              unit={state.game!.game.sourceUnit}
              unitWasInferred={state.game!.game.unitProvenance !== 'header'}
              hasUserOverride={state.game!.game.unitProvenance === 'user'}
              // Persistent flow: unit is locked to what was snapshotted.
              // (Surface a hint via the panel; no toggle.)
            />
            <IsolationPanel
              balances={projection.balances}
              isolations={state.game!.isolations.map((r) => ({
                playerId: r.playerId,
                counterpartId: r.counterpartId,
              }))}
              cyclePlayerIds={plan.cyclePlayerIds}
              onChange={handleIsolationChange}
            />
            <AdjustmentsPanel
              balances={projection.balances}
              adjustments={state.game!.adjustments.map((a) => ({
                id: a.id,
                fromId: a.fromPlayerId,
                toId: a.toPlayerId,
                amountCents: a.amountCents,
              }))}
              onAdd={(adj) =>
                handleAddAdjustment({
                  fromPlayerId: adj.fromId,
                  toPlayerId: adj.toId,
                  amountCents: adj.amountCents,
                })
              }
              onRemove={handleRemoveAdjustment}
            />
            <AuditLogPanel
              entries={state.game!.audit}
              players={state.game!.players}
            />
          </div>
          <div className="lg:sticky lg:top-[88px] lg:self-start space-y-5">
            <SettlementPanel
              plan={plan}
              balances={projection.balances}
              paymentIds={paymentIds}
              completionByPaymentId={completionByPaymentId}
              onTogglePayment={togglePayment}
              onCopyLink={handleCopyLink}
              onShareAsImage={handleShareImage}
            />
            <PersistentColophon gameId={gameId} />
          </div>
        </div>

        {/* Mobile tabbed layout */}
        <div className="lg:hidden space-y-5">
          {activeTab === 'plan' && (
            <SettlementPanel
              plan={plan}
              balances={projection.balances}
              paymentIds={paymentIds}
              completionByPaymentId={completionByPaymentId}
              onTogglePayment={togglePayment}
              onCopyLink={handleCopyLink}
              onShareAsImage={handleShareImage}
            />
          )}
          {activeTab === 'ledger' && (
            <LedgerPanel
              rows={projection.rows}
              effectiveBalances={projection.balances}
              unit={state.game!.game.sourceUnit}
              unitWasInferred={state.game!.game.unitProvenance !== 'header'}
              hasUserOverride={state.game!.game.unitProvenance === 'user'}
            />
          )}
          {activeTab === 'config' && (
            <>
              <IsolationPanel
                balances={projection.balances}
                isolations={state.game!.isolations.map((r) => ({
                  playerId: r.playerId,
                  counterpartId: r.counterpartId,
                }))}
                cyclePlayerIds={plan.cyclePlayerIds}
                onChange={handleIsolationChange}
              />
              <AdjustmentsPanel
                balances={projection.balances}
                adjustments={state.game!.adjustments.map((a) => ({
                  id: a.id,
                  fromId: a.fromPlayerId,
                  toId: a.toPlayerId,
                  amountCents: a.amountCents,
                }))}
                onAdd={(adj) =>
                  handleAddAdjustment({
                    fromPlayerId: adj.fromId,
                    toPlayerId: adj.toId,
                    amountCents: adj.amountCents,
                  })
                }
                onRemove={handleRemoveAdjustment}
              />
              <AuditLogPanel
                entries={state.game!.audit}
                players={state.game!.players}
              />
            </>
          )}
        </div>
      </main>

      {/* Off-screen share card. */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: '-99999px',
          top: 0,
          pointerEvents: 'none',
          zIndex: -1,
        }}
      >
        {plan.txns.length > 0 && (
          <ShareCard
            ref={shareCardRef}
            plan={plan}
            balances={projection.balances}
            dateLabel={formatGameDate(state.game!.game.startedAt)}
          />
        )}
      </div>
    </>
  );
}

/* ──────── Helpers ──────── */

interface Projection {
  rows: LedgerRow[];
  balances: EffectiveBalance[];
  plan: SettlementPlan;
}

function projectSnapshot(snap: PersistedGameSnapshot): Projection {
  const rows: LedgerRow[] = snap.players.map((p) => ({
    playerId: p.playerId,
    nickname: p.nickname,
    netCents: p.netCents,
    buyInCents: 0,
    buyOutCents: 0,
  }));

  // Compute effective balances by replaying adjustments.
  const balanceById = new Map<string, EffectiveBalance>(
    rows.map((r) => [
      r.playerId,
      {
        playerId: r.playerId,
        nickname: r.nickname,
        originalNetCents: r.netCents,
        effectiveNetCents: r.netCents,
      },
    ])
  );
  for (const adj of snap.adjustments) {
    const from = balanceById.get(adj.fromPlayerId);
    const to = balanceById.get(adj.toPlayerId);
    if (!from || !to) continue;
    from.effectiveNetCents += adj.amountCents;
    to.effectiveNetCents -= adj.amountCents;
  }
  const balances = Array.from(balanceById.values());
  const plan = projectSettlementPlan(snap);

  return { rows, balances, plan };
}

function formatGameDate(start: number | null): string | undefined {
  if (start === null) return undefined;
  return new Date(start)
    .toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    .toLowerCase();
}

/* ──────── In-memory "skip identity" flag ──────── */

let identityDeclined = false;
function declineIdentity(): void {
  identityDeclined = true;
}
function sessionDeclined(): boolean {
  return identityDeclined;
}

/* ──────── Subviews ──────── */

function CenterMessage({ label, body }: { label: string; body?: string }) {
  return (
    <div className="mx-auto max-w-2xl px-5 sm:px-6 py-12">
      <div className="card">
        <div className="card-header">
          <span className="ticker-label-strong">
            <span className="live-dot mr-2 align-middle" aria-hidden="true" />
            {label}
          </span>
        </div>
        {body && (
          <div className="px-5 py-6 text-[14px] text-fg-dim leading-relaxed">
            {body}
          </div>
        )}
      </div>
    </div>
  );
}

function PersistentColophon({ gameId }: { gameId: string }) {
  return (
    <aside className="card p-5 text-[12.5px] leading-relaxed text-fg-dim">
      <p className="ticker-label-strong mb-2">¶ persistent link</p>
      <p>
        <span className="text-fg font-semibold">/g/{gameId}</span> is the
        canonical URL for this game. Anyone with the link sees the same
        live state — including which payments have been marked settled.
      </p>
      <hr className="hr my-3" />
      <p>
        Polling every 8s while this tab is open. Marking a payment refreshes
        all open viewers.
      </p>
    </aside>
  );
}
