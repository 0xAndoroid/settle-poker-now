import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState } from './EmptyState';
import { LedgerPanel } from './LedgerPanel';
import { SettlementPanel } from './SettlementPanel';
import { IsolationPanel } from './IsolationPanel';
import { AdjustmentsPanel } from './AdjustmentsPanel';
import { LoadingView } from './LoadingView';
import { ErrorView } from './ErrorView';
import { ShareCard } from './ShareCard';
import { MobileTabs, type TabKey } from './MobileTabs';
import type { TickerItem } from './Masthead';
import { useLedger } from '@/hooks/useLedger';
import { computePlan } from '@/lib/settle';
import { LedgerParseError, parseLedgerCsv } from '@/lib/csv';
import { readHashFromLocation, writeHashToLocation } from '@/lib/hashState';
import { formatDollars } from '@/lib/money';
import { createPersistentGame } from '@/lib/apiClient';
import { gamePath, navigate } from '@/lib/routing';
import type {
  Adjustment,
  IsolationRule,
  LedgerUnit,
  ParsedLedger,
} from '@/lib/types';
import { shareNodeAsImage } from '@/lib/shareImage';

interface EphemeralViewProps {
  onTickerChange: (ticker: TickerItem[] | undefined) => void;
  onResetRequest: () => void;
  /**
   * Imperatively register a reset handler so the parent's "new game" button
   * in the masthead can clear our state. We pass our `reset` up via a ref.
   */
  registerReset?: (reset: () => void) => void;
  pushToast: (message: string, variant?: 'success' | 'error' | 'info') => void;
}

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

export function EphemeralView({
  onTickerChange,
  onResetRequest,
  registerReset,
  pushToast,
}: EphemeralViewProps) {
  const { state: ledgerState, fetchGame, reset: resetLedger } = useLedger();

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

  // Push ticker upward on every settlement change.
  useEffect(() => {
    if (!parsedLedger) {
      onTickerChange(undefined);
      return;
    }
    const totalMoved = plan.txns.reduce((acc, t) => acc + t.amountCents, 0);
    const biggestWinner = balances.reduce<typeof balances[number] | null>(
      (best, b) =>
        b.effectiveNetCents > 0 &&
        (!best || b.effectiveNetCents > best.effectiveNetCents)
          ? b
          : best,
      null
    );
    const ticker: TickerItem[] = [
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
    onTickerChange(ticker);
  }, [parsedLedger, balances, plan, onTickerChange]);

  const handleAddAdjustment = useCallback((adj: Adjustment) => {
    setAdjustments((current) => [...current, adj]);
  }, []);

  const handleRemoveAdjustment = useCallback((id: string) => {
    setAdjustments((current) => current.filter((a) => a.id !== id));
  }, []);

  const handleAnalyze = useCallback(
    (id: string) => {
      setAdjustments([]);
      setIsolations([]);
      setUnitOverride(null);
      setParseError(null);
      fetchGame(id);
    },
    [fetchGame]
  );

  const handleCreatePersistentLink = useCallback(
    async (pokernowUrl: string) => {
      const game = await createPersistentGame({ pokernowUrl });
      navigate(gamePath(game.game.id));
    },
    []
  );

  const reset = useCallback(() => {
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

  // Expose `reset` to the parent so the masthead's "new game" can use it.
  useEffect(() => {
    registerReset?.(reset);
  }, [registerReset, reset]);

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

  const errorMessage =
    parseError ??
    (ledgerState.status === 'error' ? ledgerState.error ?? 'unknown error' : null);

  if (ledgerState.status === 'idle') {
    return (
      <EmptyState
        onAnalyze={handleAnalyze}
        onCreateLink={handleCreatePersistentLink}
      />
    );
  }
  if (ledgerState.status === 'loading') {
    return <LoadingView gameId={ledgerState.gameId ?? '…'} />;
  }
  if (ledgerState.status === 'error' || (parsedLedger === null && parseError)) {
    return (
      <ErrorView
        message={errorMessage ?? 'unknown error'}
        gameId={ledgerState.gameId}
        onRetry={() => ledgerState.gameId && fetchGame(ledgerState.gameId)}
        onReset={onResetRequest}
      />
    );
  }
  if (!parsedLedger) return null;

  return (
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
            balances={balances}
            dateLabel={formatGameDate(parsedLedger.startedAt)}
          />
        )}
      </div>
    </>
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
