import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Header } from './components/Header';
import { EmptyState } from './components/EmptyState';
import { LedgerPanel } from './components/LedgerPanel';
import { SettlementPanel } from './components/SettlementPanel';
import { GroupsPanel, GROUP_LABEL_FOR } from './components/GroupsPanel';
import { AdjustmentsPanel } from './components/AdjustmentsPanel';
import { LoadingView } from './components/LoadingView';
import { ErrorView } from './components/ErrorView';
import { ShareCard } from './components/ShareCard';
import { ToastViewport } from './components/Toast';
import { MobileTabs, type TabKey } from './components/MobileTabs';
import { useTheme } from './hooks/useTheme';
import { useLedger } from './hooks/useLedger';
import { useToast } from './hooks/useToast';
import { computePlan } from './lib/settle';
import { readHashFromLocation, writeHashToLocation } from './lib/hashState';
import type { Adjustment, Group } from './lib/types';
import { shareNodeAsImage } from './lib/shareImage';

function formatGameDate(start: Date | null): string | undefined {
  if (!start) return undefined;
  return start.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme();
  const { state: ledgerState, fetchGame, reset: resetLedger } = useLedger();
  const { toasts, push: pushToast, dismiss: dismissToast } = useToast();

  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('plan');
  const [highlightedPlayerId, setHighlightedPlayerId] = useState<string | null>(null);

  const shareCardRef = useRef<HTMLDivElement | null>(null);

  // Hydrate initial state from URL hash exactly once.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const initial = readHashFromLocation();
    if (initial.adjustments.length > 0) setAdjustments(initial.adjustments);
    if (initial.groups.length > 0) setGroups(initial.groups);
    if (initial.gameId) fetchGame(initial.gameId);
  }, [fetchGame]);

  // Persist state to URL hash whenever it changes.
  useEffect(() => {
    if (!hydratedRef.current) return;
    writeHashToLocation({
      gameId: ledgerState.gameId,
      adjustments,
      groups,
    });
  }, [ledgerState.gameId, adjustments, groups]);

  // Drop adjustments / group memberships that reference players who no longer
  // exist (e.g. after switching games).
  useEffect(() => {
    if (!ledgerState.ledger) return;
    const validIds = new Set(ledgerState.ledger.rows.map((r) => r.playerId));

    setAdjustments((current) => {
      const filtered = current.filter(
        (a) => validIds.has(a.fromId) && validIds.has(a.toId)
      );
      return filtered.length === current.length ? current : filtered;
    });

    setGroups((current) => {
      const filtered = current
        .map((g) => ({
          ...g,
          memberIds: g.memberIds.filter((id) => validIds.has(id)),
        }))
        .filter((g) => g.memberIds.length > 0);
      return filtered.length === current.length &&
        filtered.every((g, i) => g.memberIds.length === current[i]?.memberIds.length)
        ? current
        : filtered;
    });
  }, [ledgerState.ledger]);

  const { balances, plan } = useMemo(() => {
    if (!ledgerState.ledger) {
      return { balances: [], plan: { groups: [], txns: [], isFullyBalanced: true, totalImbalanceCents: 0 } };
    }
    return computePlan(ledgerState.ledger.rows, adjustments, groups);
  }, [ledgerState.ledger, adjustments, groups]);

  const groupLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const g of plan.groups) {
      labels[g.groupId] = GROUP_LABEL_FOR(groups, g.groupId);
    }
    return labels;
  }, [plan.groups, groups]);

  const handleAddAdjustment = useCallback((adj: Adjustment) => {
    setAdjustments((current) => [...current, adj]);
  }, []);

  const handleRemoveAdjustment = useCallback((id: string) => {
    setAdjustments((current) => current.filter((a) => a.id !== id));
  }, []);

  const handleSubmitGameId = useCallback(
    (id: string) => {
      // Reset adjustments/groups when switching to a fresh game.
      setAdjustments([]);
      setGroups([]);
      fetchGame(id);
    },
    [fetchGame]
  );

  const handleReset = useCallback(() => {
    resetLedger();
    setAdjustments([]);
    setGroups([]);
    writeHashToLocation({ gameId: null, adjustments: [], groups: [] });
  }, [resetLedger]);

  const handleShareAsImage = useCallback(async () => {
    if (!shareCardRef.current) {
      pushToast('Share card not ready, try again in a moment.', 'error');
      return;
    }
    const result = await shareNodeAsImage(shareCardRef.current, {
      filename: `settle-${ledgerState.gameId ?? 'plan'}.png`,
      title: 'Settlement plan',
      text: 'Settlement plan generated by settle-poker-now',
    });
    switch (result.kind) {
      case 'shared':
        // Native share sheet — usually visible feedback enough.
        pushToast('Shared.', 'success');
        break;
      case 'copied':
        pushToast('Image copied — paste into chat.', 'success');
        break;
      case 'downloaded':
        pushToast('PNG downloaded.', 'success');
        break;
      case 'cancelled':
        // Don't toast on user cancel.
        break;
      case 'failed':
        pushToast(result.detail ?? 'Share failed.', 'error');
        break;
    }
  }, [ledgerState.gameId, pushToast]);

  const showHeader = ledgerState.status !== 'idle';

  return (
    <div className="min-h-full">
      <Header
        theme={theme}
        onThemeToggle={toggleTheme}
        onReset={handleReset}
        showReset={showHeader}
      />

      {ledgerState.status === 'idle' && (
        <EmptyState onSubmit={handleSubmitGameId} loading={false} />
      )}

      {ledgerState.status === 'loading' && (
        <LoadingView gameId={ledgerState.gameId ?? '…'} />
      )}

      {ledgerState.status === 'error' && (
        <ErrorView
          message={ledgerState.error ?? 'Unknown error'}
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

          <main className="mx-auto max-w-6xl px-4 sm:px-6 py-5 sm:py-8 pb-24">
            <div className="hidden lg:grid lg:grid-cols-2 lg:gap-6">
              <div className="space-y-6">
                <LedgerPanel
                  rows={ledgerState.ledger.rows}
                  effectiveBalances={balances}
                  highlightedPlayerId={highlightedPlayerId}
                  onHighlight={setHighlightedPlayerId}
                />
                <GroupsPanel balances={balances} groups={groups} onChange={setGroups} />
                <AdjustmentsPanel
                  balances={balances}
                  adjustments={adjustments}
                  onAdd={handleAddAdjustment}
                  onRemove={handleRemoveAdjustment}
                />
              </div>
              <div className="lg:sticky lg:top-20 lg:self-start space-y-4">
                <SettlementPanel
                  plan={plan}
                  balances={balances}
                  groupLabels={groupLabels}
                  onShareAsImage={handleShareAsImage}
                  onHighlight={setHighlightedPlayerId}
                />
                <DesktopHelpCard txnCount={plan.txns.length} />
              </div>
            </div>

            {/* Mobile: tab-switched single column */}
            <div className="lg:hidden space-y-5">
              {activeTab === 'plan' && (
                <SettlementPanel
                  plan={plan}
                  balances={balances}
                  groupLabels={groupLabels}
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
                  <GroupsPanel
                    balances={balances}
                    groups={groups}
                    onChange={setGroups}
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

      {/* Off-screen share card. Kept rendered (not display:none) so html-to-image can read computed styles. */}
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
            groups={groups}
            dateLabel={formatGameDate(ledgerState.ledger.startedAt)}
          />
        )}
      </div>

      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

interface DesktopHelpCardProps {
  txnCount: number;
}

function DesktopHelpCard({ txnCount }: DesktopHelpCardProps) {
  return (
    <aside className="surface rounded-2xl p-5 hidden lg:block animate-fade-in">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-accent/10 text-accent flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </div>
        <div className="space-y-2 text-[13px] text-[var(--fg-dim)] leading-relaxed">
          <p>
            <span className="font-medium text-[var(--fg)]">How it works.</span>{' '}
            Greedy max-creditor-meets-max-debtor — the biggest winner is matched
            against the biggest loser, repeatedly, until everyone settles.
            Produces ≤ N-1 payments for N players.
          </p>
          {txnCount > 0 && (
            <p>
              <span className="font-medium text-[var(--fg)]">Settled in {txnCount}.</span>{' '}
              Tap any row to copy. Use <span className="font-mono text-[12px] px-1.5 py-0.5 rounded-md bg-[var(--bg-elev-2)] border border-[var(--border)]">Already paid</span> to record cash that already changed hands.
            </p>
          )}
          <p className="text-[var(--fg-mute)] text-[12px]">
            All state lives in the URL hash — share the link to share the plan.
          </p>
        </div>
      </div>
    </aside>
  );
}
