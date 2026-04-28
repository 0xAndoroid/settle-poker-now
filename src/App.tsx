import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Masthead } from './components/Masthead';
import { EmptyState } from './components/EmptyState';
import { LedgerPanel } from './components/LedgerPanel';
import { SettlementPanel } from './components/SettlementPanel';
import { IsolationPanel } from './components/IsolationPanel';
import { AdjustmentsPanel } from './components/AdjustmentsPanel';
import { LoadingView } from './components/LoadingView';
import { ErrorView } from './components/ErrorView';
import { ShareCard } from './components/ShareCard';
import { ToastViewport } from './components/Toast';
import { MobileTabs, type TabKey } from './components/MobileTabs';
import { useLedger } from './hooks/useLedger';
import { useToast } from './hooks/useToast';
import { computePlan } from './lib/settle';
import { readHashFromLocation, writeHashToLocation } from './lib/hashState';
import type { Adjustment, IsolationRule } from './lib/types';
import { shareNodeAsImage } from './lib/shareImage';

function formatGameDate(start: Date | null): string | undefined {
  if (!start) return undefined;
  return start
    .toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    .toLowerCase();
}

export default function App() {
  const { state: ledgerState, fetchGame, reset: resetLedger } = useLedger();
  const { toasts, push: pushToast, dismiss: dismissToast } = useToast();

  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [isolations, setIsolations] = useState<IsolationRule[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('plan');
  const [highlightedPlayerId, setHighlightedPlayerId] = useState<string | null>(null);

  const shareCardRef = useRef<HTMLDivElement | null>(null);

  // Hydrate from URL hash exactly once.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const initial = readHashFromLocation();
    if (initial.adjustments.length > 0) setAdjustments(initial.adjustments);
    if (initial.isolations.length > 0) setIsolations(initial.isolations);
    if (initial.gameId) fetchGame(initial.gameId);
  }, [fetchGame]);

  // Persist state to URL hash whenever it changes.
  useEffect(() => {
    if (!hydratedRef.current) return;
    writeHashToLocation({
      gameId: ledgerState.gameId,
      adjustments,
      isolations,
    });
  }, [ledgerState.gameId, adjustments, isolations]);

  // Drop adjustments / isolation rules referencing players that no longer exist.
  useEffect(() => {
    if (!ledgerState.ledger) return;
    const validIds = new Set(ledgerState.ledger.rows.map((r) => r.playerId));

    setAdjustments((current) => {
      const filtered = current.filter(
        (a) => validIds.has(a.fromId) && validIds.has(a.toId)
      );
      return filtered.length === current.length ? current : filtered;
    });

    setIsolations((current) => {
      const filtered = current.filter(
        (r) => validIds.has(r.playerId) && validIds.has(r.counterpartId)
      );
      return filtered.length === current.length ? current : filtered;
    });
  }, [ledgerState.ledger]);

  const { balances, plan } = useMemo(() => {
    if (!ledgerState.ledger) {
      return {
        balances: [],
        plan: {
          txns: [],
          isFullyBalanced: true,
          residueCents: 0,
          cyclePlayerIds: [],
          appliedIsolations: [],
        },
      };
    }
    return computePlan(ledgerState.ledger.rows, adjustments, isolations);
  }, [ledgerState.ledger, adjustments, isolations]);

  const handleAddAdjustment = useCallback((adj: Adjustment) => {
    setAdjustments((current) => [...current, adj]);
  }, []);

  const handleRemoveAdjustment = useCallback((id: string) => {
    setAdjustments((current) => current.filter((a) => a.id !== id));
  }, []);

  const handleSubmitGameId = useCallback(
    (id: string) => {
      // Reset adjustments/isolations when switching to a fresh game.
      setAdjustments([]);
      setIsolations([]);
      fetchGame(id);
    },
    [fetchGame]
  );

  const handleReset = useCallback(() => {
    resetLedger();
    setAdjustments([]);
    setIsolations([]);
    writeHashToLocation({ gameId: null, adjustments: [], isolations: [] });
  }, [resetLedger]);

  const handleShareAsImage = useCallback(async () => {
    if (!shareCardRef.current) {
      pushToast('share card not ready, try again', 'error');
      return;
    }
    const result = await shareNodeAsImage(shareCardRef.current, {
      filename: `settle-${ledgerState.gameId ?? 'plan'}.png`,
      title: 'settle.andrew.ee — settlement',
      text: 'Settlement plan from settle.andrew.ee',
    });
    switch (result.kind) {
      case 'shared':
        pushToast('shared.', 'success');
        break;
      case 'copied':
        pushToast('copied — paste anywhere', 'success');
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
  }, [ledgerState.gameId, pushToast]);

  const showHeader = ledgerState.status !== 'idle';

  return (
    <div className="min-h-full">
      <Masthead onReset={handleReset} showReset={showHeader} />

      {ledgerState.status === 'idle' && (
        <EmptyState onSubmit={handleSubmitGameId} loading={false} />
      )}

      {ledgerState.status === 'loading' && (
        <LoadingView gameId={ledgerState.gameId ?? '…'} />
      )}

      {ledgerState.status === 'error' && (
        <ErrorView
          message={ledgerState.error ?? 'unknown error'}
          gameId={ledgerState.gameId}
          onRetry={() => ledgerState.gameId && fetchGame(ledgerState.gameId)}
          onReset={handleReset}
        />
      )}

      {ledgerState.status === 'success' && ledgerState.ledger && (
        <>
          <MobileTabs
            active={activeTab}
            onChange={setActiveTab}
            txnCount={plan.txns.length}
            playerCount={balances.length}
          />

          <main className="mx-auto max-w-5xl px-5 sm:px-8 py-6 sm:py-10 pb-24">
            {/* Desktop: two-column broadsheet, vertical rule between */}
            <div className="hidden lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:divide-x-2 lg:divide-ink">
              <div className="space-y-6 lg:pr-8">
                <LedgerPanel
                  rows={ledgerState.ledger.rows}
                  effectiveBalances={balances}
                  highlightedPlayerId={highlightedPlayerId}
                  onHighlight={setHighlightedPlayerId}
                />
                <IsolationPanel
                  balances={balances}
                  isolations={isolations}
                  cyclePlayerIds={plan.cyclePlayerIds}
                  onChange={setIsolations}
                />
                <AdjustmentsPanel
                  balances={balances}
                  adjustments={adjustments}
                  onAdd={handleAddAdjustment}
                  onRemove={handleRemoveAdjustment}
                />
              </div>
              <div className="lg:sticky lg:top-6 lg:self-start space-y-6 lg:pl-8">
                <SettlementPanel
                  plan={plan}
                  balances={balances}
                  onShareAsImage={handleShareAsImage}
                  onHighlight={setHighlightedPlayerId}
                />
                <Colophon />
              </div>
            </div>

            {/* Mobile: tabbed */}
            <div className="lg:hidden space-y-5">
              {activeTab === 'plan' && (
                <SettlementPanel
                  plan={plan}
                  balances={balances}
                  onShareAsImage={handleShareAsImage}
                />
              )}
              {activeTab === 'ledger' && (
                <LedgerPanel
                  rows={ledgerState.ledger.rows}
                  effectiveBalances={balances}
                />
              )}
              {activeTab === 'config' && (
                <>
                  <IsolationPanel
                    balances={balances}
                    isolations={isolations}
                    cyclePlayerIds={plan.cyclePlayerIds}
                    onChange={setIsolations}
                  />
                  <AdjustmentsPanel
                    balances={balances}
                    adjustments={adjustments}
                    onAdd={handleAddAdjustment}
                    onRemove={handleRemoveAdjustment}
                  />
                </>
              )}
            </div>
          </main>
        </>
      )}

      {/* Off-screen share card. Kept rendered so html-to-image can read computed styles. */}
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
        {ledgerState.ledger && plan.txns.length > 0 && (
          <ShareCard
            ref={shareCardRef}
            plan={plan}
            balances={balances}
            dateLabel={formatGameDate(ledgerState.ledger.startedAt)}
          />
        )}
      </div>

      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

function Colophon() {
  return (
    <aside className="border-2 border-ink p-5 font-mono text-[12px] leading-relaxed text-ink-2">
      <p className="text-[10px] uppercase tracking-masthead font-bold text-mute mb-2">
        ¶ how it works
      </p>
      <p>
        <span className="font-bold text-ink">Greedy max-creditor↔max-debtor.</span>
        {' '}The biggest winner is matched against the biggest loser, repeatedly,
        until everyone settles. ≤ N−1 payments for N players, often fewer.
      </p>
      <div className="dotted my-3" />
      <p>
        <span className="font-bold text-ink">URL hash state.</span> Every adjustment
        and isolation rule encodes into the URL. Share the link, share the plan.
      </p>
    </aside>
  );
}
