import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Masthead, type TickerItem } from './components/Masthead';
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
import { useTheme } from './hooks/useTheme';
import { computePlan } from './lib/settle';
import { LedgerParseError, parseLedgerCsv } from './lib/csv';
import { readHashFromLocation, writeHashToLocation } from './lib/hashState';
import { formatDollars } from './lib/money';
import type {
  Adjustment,
  IsolationRule,
  LedgerUnit,
  ParsedLedger,
} from './lib/types';
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
  const { theme, toggle: toggleTheme } = useTheme();
  const { state: ledgerState, fetchGame, reset: resetLedger } = useLedger();
  const { toasts, push: pushToast, dismiss: dismissToast } = useToast();

  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [isolations, setIsolations] = useState<IsolationRule[]>([]);
  const [unitOverride, setUnitOverride] = useState<LedgerUnit | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
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
    if (initial.unitOverride !== null) setUnitOverride(initial.unitOverride);
    if (initial.gameId) fetchGame(initial.gameId);
  }, [fetchGame]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    writeHashToLocation({
      gameId: ledgerState.gameId,
      adjustments,
      isolations,
      unitOverride,
    });
  }, [ledgerState.gameId, adjustments, isolations, unitOverride]);

  const parsedLedger: ParsedLedger | null = useMemo(() => {
    if (!ledgerState.csv) return null;
    const effectiveHint = unitOverride ?? ledgerState.headerUnit;
    try {
      return parseLedgerCsv(
        ledgerState.csv,
        effectiveHint ? { unit: effectiveHint } : {}
      );
    } catch (err) {
      const message =
        err instanceof LedgerParseError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Unknown parse error';
      queueMicrotask(() => setParseError(message));
      return null;
    }
  }, [ledgerState.csv, ledgerState.headerUnit, unitOverride]);

  useEffect(() => {
    if (ledgerState.status !== 'success') setParseError(null);
  }, [ledgerState.status]);

  useEffect(() => {
    if (!parsedLedger) return;
    const validIds = new Set(parsedLedger.rows.map((r) => r.playerId));

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
  }, [parsedLedger]);

  const { balances, plan } = useMemo(() => {
    if (!parsedLedger) {
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
    return computePlan(parsedLedger.rows, adjustments, isolations);
  }, [parsedLedger, adjustments, isolations]);

  const ticker: TickerItem[] | undefined = useMemo(() => {
    if (!parsedLedger) return undefined;
    const totalMoved = plan.txns.reduce((acc, t) => acc + t.amountCents, 0);
    const biggestWinner = balances.reduce<typeof balances[number] | null>(
      (best, b) =>
        b.effectiveNetCents > 0 &&
        (!best || b.effectiveNetCents > best.effectiveNetCents)
          ? b
          : best,
      null
    );
    return [
      { label: 'players', value: String(parsedLedger.rows.length) },
      { label: 'payments', value: String(plan.txns.length), tone: 'accent' },
      { label: 'total', value: formatDollars(totalMoved) },
      ...(biggestWinner
        ? ([
            {
              label: 'top',
              value: `${biggestWinner.nickname} ${formatDollars(biggestWinner.effectiveNetCents)}`,
              tone: 'gain',
            },
          ] satisfies TickerItem[])
        : []),
    ];
  }, [parsedLedger, balances, plan]);

  const handleAddAdjustment = useCallback((adj: Adjustment) => {
    setAdjustments((current) => [...current, adj]);
  }, []);

  const handleRemoveAdjustment = useCallback((id: string) => {
    setAdjustments((current) => current.filter((a) => a.id !== id));
  }, []);

  const handleSubmitGameId = useCallback(
    (id: string) => {
      setAdjustments([]);
      setIsolations([]);
      setUnitOverride(null);
      setParseError(null);
      fetchGame(id);
    },
    [fetchGame]
  );

  const handleReset = useCallback(() => {
    resetLedger();
    setAdjustments([]);
    setIsolations([]);
    setUnitOverride(null);
    setParseError(null);
    writeHashToLocation({
      gameId: null,
      adjustments: [],
      isolations: [],
      unitOverride: null,
    });
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
  }, [ledgerState.gameId, pushToast]);

  const showHeader = ledgerState.status !== 'idle';
  const errorMessage =
    parseError ??
    (ledgerState.status === 'error' ? ledgerState.error ?? 'unknown error' : null);

  return (
    <div className="min-h-full">
      <Masthead
        theme={theme}
        onThemeToggle={toggleTheme}
        onReset={handleReset}
        showReset={showHeader}
        ticker={ticker}
      />

      {ledgerState.status === 'idle' && (
        <EmptyState onSubmit={handleSubmitGameId} loading={false} />
      )}

      {ledgerState.status === 'loading' && (
        <LoadingView gameId={ledgerState.gameId ?? '…'} />
      )}

      {(ledgerState.status === 'error' || (parsedLedger === null && parseError)) && (
        <ErrorView
          message={errorMessage ?? 'unknown error'}
          gameId={ledgerState.gameId}
          onRetry={() => ledgerState.gameId && fetchGame(ledgerState.gameId)}
          onReset={handleReset}
        />
      )}

      {ledgerState.status === 'success' && parsedLedger && (
        <>
          <MobileTabs
            active={activeTab}
            onChange={setActiveTab}
            txnCount={plan.txns.length}
            playerCount={balances.length}
          />

          <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8 pb-24">
            <div className="hidden lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-6">
              <div className="space-y-5">
                <LedgerPanel
                  rows={parsedLedger.rows}
                  effectiveBalances={balances}
                  unit={parsedLedger.unit}
                  unitWasInferred={parsedLedger.unitWasInferred}
                  hasUserOverride={unitOverride !== null}
                  onUnitChange={setUnitOverride}
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
              <div className="lg:sticky lg:top-[88px] lg:self-start space-y-5">
                <SettlementPanel
                  plan={plan}
                  balances={balances}
                  onShareAsImage={handleShareAsImage}
                  onHighlight={setHighlightedPlayerId}
                />
                <Colophon />
              </div>
            </div>

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
                  rows={parsedLedger.rows}
                  effectiveBalances={balances}
                  unit={parsedLedger.unit}
                  unitWasInferred={parsedLedger.unitWasInferred}
                  hasUserOverride={unitOverride !== null}
                  onUnitChange={setUnitOverride}
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

      {/* Off-screen share card. Always rendered so html-to-image can snapshot. */}
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
        {parsedLedger && plan.txns.length > 0 && (
          <ShareCard
            ref={shareCardRef}
            plan={plan}
            balances={balances}
            dateLabel={formatGameDate(parsedLedger.startedAt)}
          />
        )}
      </div>

      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

function Colophon() {
  return (
    <aside className="card p-5 text-[12.5px] leading-relaxed text-fg-dim">
      <p className="ticker-label-strong mb-2">¶ how it works</p>
      <p>
        <span className="text-fg font-semibold">Greedy max-creditor↔max-debtor.</span>
        {' '}The biggest winner is matched against the biggest loser, repeatedly,
        until everyone settles. ≤ N−1 payments for N players, often fewer.
      </p>
      <hr className="hr my-3" />
      <p>
        <span className="text-fg font-semibold">URL hash state.</span> Every adjustment,
        isolation rule, and unit override encodes into the URL. Share the link, share the plan.
      </p>
    </aside>
  );
}
