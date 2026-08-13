import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Amount } from './Amount';
import { EmptyState } from './EmptyState';
import { LoadingView } from './LoadingView';
import { ErrorView } from './ErrorView';
import { MobileTabs, type EphemeralTabKey } from './MobileTabs';
import { EphemeralDesktopPanels, EphemeralMobilePanels } from './EphemeralGamePanels';
import type { TickerItem } from './Masthead';
import type { ConfirmFn } from '@/hooks/useConfirmDialog';
import { useLedger } from '@/hooks/useLedger';
import {
  computePlan,
  roundAdjustmentAmountsToDollars,
  roundLedgerRowsToDollars,
} from '@/lib/settle';
import { LedgerParseError, parseLedgerCsv } from '@/lib/csv';
import { readHashFromLocation, writeHashToLocation } from '@/lib/hashState';
import { formatDollars } from '@/lib/money';
import { DEFAULT_PAYMENT_NOTE } from '@/lib/paymentLinks';
import { createFinalizedGame } from '@/lib/apiClient';
import { errorMessage as getErrorMessage } from '@/lib/errors';
import { createLiveGameRemote } from '@/lib/liveApiClient';
import { gamePath, liveGamePath, navigate } from '@/lib/routing';
import { type AliasRule, canonicalize } from '@/lib/aliases';
import {
  buildLedgerRecentGameEntry,
  getRecentGamesStorage,
  markRecentGameMissing,
  upsertRecentGame,
} from '@/lib/recentGames';
import type {
  Adjustment,
  IsolationRule,
  LedgerUnit,
  PaymentPreference,
  ParsedLedger,
  PersistedAlias,
  PersistedPlayer,
} from '@/lib/types';

interface EphemeralViewProps {
  onTickerChange: (ticker: TickerItem[] | undefined) => void;
  /**
   * Imperatively register a reset handler so the parent's "new game" button
   * in the masthead can clear our state. We pass our `reset` up via a ref.
   */
  registerReset?: (reset: () => void) => void;
  pushToast: (message: string, variant?: 'success' | 'error' | 'info') => void;
  confirm: ConfirmFn;
}

export function EphemeralView({
  onTickerChange,
  registerReset,
  pushToast,
  confirm,
}: EphemeralViewProps) {
  const { state: ledgerState, fetchGame, reset: resetLedger } = useLedger();

  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [isolations, setIsolations] = useState<IsolationRule[]>([]);
  const [aliases, setAliases] = useState<AliasRule[]>([]);
  const [paymentPreferences, setPaymentPreferences] = useState<PaymentPreference[]>([]);
  const [unitOverride, setUnitOverride] = useState<LedgerUnit | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<EphemeralTabKey>('ledger');
  const [highlightedPlayerId, setHighlightedPlayerId] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [note, setNote] = useState('');
  const [startingLive, setStartingLive] = useState(false);
  const [roundToDollars, setRoundToDollars] = useState(true);

  // Hydrate from URL hash exactly once.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const initial = readHashFromLocation();
    if (initial.adjustments.length > 0) setAdjustments(initial.adjustments);
    if (initial.isolations.length > 0) setIsolations(initial.isolations);
    if (initial.aliases.length > 0) setAliases(initial.aliases);
    if (initial.paymentPreferences.length > 0) {
      setPaymentPreferences(initial.paymentPreferences);
    }
    if (initial.unitOverride !== null) setUnitOverride(initial.unitOverride);
    if (initial.gameId) fetchGame(initial.gameId);
  }, [fetchGame]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    writeHashToLocation({
      gameId: ledgerState.gameId,
      adjustments,
      isolations,
      aliases,
      paymentPreferences,
      unitOverride,
    });
  }, [ledgerState.gameId, adjustments, isolations, aliases, paymentPreferences, unitOverride]);

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
    if (ledgerState.errorStatus === 404 && ledgerState.gameId) {
      markRecentGameMissing(getRecentGamesStorage(), 'ledger', ledgerState.gameId);
    }
  }, [ledgerState.errorStatus, ledgerState.gameId]);

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
    setAliases((current) => {
      const filtered = current.filter(
        (a) =>
          validIds.has(a.playerId) && validIds.has(a.aliasToPlayerId)
      );
      return filtered.length === current.length ? current : filtered;
    });
    setPaymentPreferences((current) => {
      const filtered = current.filter((p) => validIds.has(p.playerId));
      return filtered.length === current.length ? current : filtered;
    });
  }, [parsedLedger]);

  useEffect(() => {
    if (ledgerState.status !== 'success' || !ledgerState.gameId || !parsedLedger) return;
    upsertRecentGame(
      getRecentGamesStorage(),
      buildLedgerRecentGameEntry({
        gameId: ledgerState.gameId,
        ledger: parsedLedger,
      })
    );
  }, [ledgerState.gameId, ledgerState.status, parsedLedger]);

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
          algorithm: 'optimal' as const,
          subsetCount: 0,
          paymentPreferenceStatus: {
            applied: false,
            reason: 'none' as const,
            venmoPlayerIds: [],
            zellePlayerIds: [],
          },
        },
      };
    }
    return computePlan(
      roundToDollars ? roundLedgerRowsToDollars(parsedLedger.rows) : parsedLedger.rows,
      roundToDollars ? roundAdjustmentAmountsToDollars(adjustments) : adjustments,
      isolations,
      aliases,
      paymentPreferences
    );
  }, [parsedLedger, adjustments, isolations, aliases, paymentPreferences, roundToDollars]);

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
      setAliases([]);
      setPaymentPreferences([]);
      setUnitOverride(null);
      setParseError(null);
      fetchGame(id);
    },
    [fetchGame]
  );

  const handleStartLiveGame = useCallback(async () => {
    setStartingLive(true);
    try {
      const { game } = await createLiveGameRemote({});
      navigate(liveGamePath(game.game.id));
    } catch (err) {
      pushToast(getErrorMessage(err, 'Could not start live game.'), 'error');
      setStartingLive(false);
    }
  }, [pushToast]);

  const handleAddAlias = useCallback(
    async (input: { playerId: string; aliasToPlayerId: string }) => {
      // Mirror the server-side validation so the URL hash never holds a
      // self-loop or cycle. Canonicalize-on-write so the graph stays a
      // one-hop forest (matches the server contract).
      if (input.playerId === input.aliasToPlayerId) {
        pushToast('A player cannot be aliased to themselves.', 'error');
        return;
      }
      setAliases((current) => {
        const proposed = new Map<string, string>();
        for (const a of current) {
          if (a.playerId !== input.playerId) {
            proposed.set(a.playerId, a.aliasToPlayerId);
          }
        }
        proposed.set(input.playerId, input.aliasToPlayerId);
        const canonicalTarget = canonicalize(input.aliasToPlayerId, proposed);
        if (canonicalTarget === null) {
          pushToast('Refusing alias: would form a cycle.', 'error');
          return current;
        }
        if (canonicalTarget === input.playerId) {
          pushToast(
            `Refusing alias: target collapses back to ${input.playerId}.`,
            'error'
          );
          return current;
        }
        const next = current.filter((a) => a.playerId !== input.playerId);
        next.push({
          playerId: input.playerId,
          aliasToPlayerId: canonicalTarget,
        });
        return next;
      });
      setPaymentPreferences((current) =>
        current.filter((preference) => preference.playerId !== input.playerId)
      );
    },
    [pushToast]
  );

  const handleRemoveAlias = useCallback(async (playerId: string) => {
    setAliases((current) => current.filter((a) => a.playerId !== playerId));
  }, []);

  /** AliasPanel expects PersistedPlayer + PersistedAlias shapes. */
  const aliasPanelPlayers: PersistedPlayer[] = useMemo(
    () =>
      parsedLedger
        ? parsedLedger.rows.map((r) => ({
            playerId: r.playerId,
            nickname: r.nickname,
            netCents: r.netCents,
          }))
        : [],
    [parsedLedger]
  );
  const aliasPanelRows: PersistedAlias[] = useMemo(
    () =>
      aliases.map((a) => ({
        playerId: a.playerId,
        aliasToPlayerId: a.aliasToPlayerId,
        createdAt: 0,
        createdBy: null,
      })),
    [aliases]
  );

  const handleFinalize = useCallback(async () => {
    if (!parsedLedger || !ledgerState.gameId) {
      pushToast('nothing to finalize yet', 'error');
      return;
    }
    if (plan.cyclePlayerIds.length > 0) {
      pushToast('break the isolation cycle first', 'error');
      return;
    }
    const trimmedNote = note.trim();
    const finalizeNote = trimmedNote.length > 0 ? trimmedNote : DEFAULT_PAYMENT_NOTE;
    const finalizeTotal = plan.txns.reduce((acc, txn) => acc + txn.amountCents, 0);
    const confirmed = await confirm({
      title: 'Finalize this settlement?',
      confirmLabel: 'finalize',
      body: (
        <div className="space-y-3">
          <p>
            The settlement plan will lock and a shareable link will be minted. The group can still
            mark payments complete after finalization.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-[6px] border border-line bg-fill-1 p-3">
              <p className="ticker-label mb-1">payments</p>
              <p className="num text-fg font-bold text-[15px]">{plan.txns.length}</p>
            </div>
            <div className="rounded-[6px] border border-line bg-fill-1 p-3">
              <p className="ticker-label mb-1">total moved</p>
              <p className="text-fg font-bold text-[15px]">
                <Amount cents={finalizeTotal} />
              </p>
            </div>
          </div>
          <p>
            Venmo note: <span className="font-mono text-fg">{finalizeNote}</span>
          </p>
        </div>
      ),
    });
    if (!confirmed) return;
    setFinalizing(true);
    try {
      const game = await createFinalizedGame({
        // The worker accepts bare ids via extractGameId, but pass a full
        // URL so the audit trail records something a human recognises.
        pokernowUrl:
          ledgerState.gameId === 'demo'
            ? 'demo'
            : `https://www.pokernow.club/games/${ledgerState.gameId}`,
        adjustments: adjustments.map((a) => ({
          fromPlayerId: a.fromId,
          toPlayerId: a.toId,
          amountCents: a.amountCents,
        })),
        isolations: isolations.map((r) => ({
          playerId: r.playerId,
          counterpartId: r.counterpartId,
        })),
        aliases: aliases.map((a) => ({
          playerId: a.playerId,
          aliasToPlayerId: a.aliasToPlayerId,
        })),
        paymentPreferences,
        roundToDollars,
        note: trimmedNote.length > 0 ? trimmedNote : null,
      });
      navigate(gamePath(game.game.id));
    } catch (err) {
      pushToast(getErrorMessage(err, 'Could not finalize game.'), 'error');
      setFinalizing(false);
    }
  }, [adjustments, aliases, confirm, isolations, ledgerState.gameId, note, parsedLedger, paymentPreferences, plan.cyclePlayerIds.length, plan.txns, pushToast, roundToDollars]);

  const reset = useCallback(() => {
    resetLedger();
    setAdjustments([]);
    setIsolations([]);
    setAliases([]);
    setPaymentPreferences([]);
    setUnitOverride(null);
    setParseError(null);
    setNote('');
    setStartingLive(false);
    writeHashToLocation({
      gameId: null,
      adjustments: [],
      isolations: [],
      aliases: [],
      paymentPreferences: [],
      unitOverride: null,
    });
  }, [resetLedger]);

  // Expose `reset` to the parent so the masthead's "new game" can use it.
  useEffect(() => {
    registerReset?.(reset);
  }, [registerReset, reset]);

  const viewErrorMessage =
    parseError ??
    (ledgerState.status === 'error' ? ledgerState.error ?? 'unknown error' : null);

  if (ledgerState.status === 'idle') {
    return (
      <EmptyState
        onAnalyze={handleAnalyze}
        onStartLiveGame={handleStartLiveGame}
        startingLive={startingLive}
      />
    );
  }
  if (ledgerState.status === 'loading') {
    return <LoadingView gameId={ledgerState.gameId ?? '...'} onCancel={reset} />;
  }
  if (ledgerState.status === 'error' || (parsedLedger === null && parseError)) {
    return (
      <ErrorView
        message={viewErrorMessage ?? 'unknown error'}
        gameId={ledgerState.gameId}
        onRetry={() => ledgerState.gameId && fetchGame(ledgerState.gameId)}
        onReset={reset}
      />
    );
  }
  if (!parsedLedger) return null;

  return (
    <>
      <MobileTabs
        mode="ephemeral"
        active={activeTab}
        onChange={setActiveTab}
        txnCount={plan.txns.length}
        playerCount={balances.length}
      />

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8 pb-24">
        <EphemeralDesktopPanels
          parsedLedger={parsedLedger}
          balances={balances}
          plan={plan}
          unitOverride={unitOverride}
          onUnitChange={setUnitOverride}
          highlightedPlayerId={highlightedPlayerId}
          onHighlight={setHighlightedPlayerId}
          aliasPanelPlayers={aliasPanelPlayers}
          aliasPanelRows={aliasPanelRows}
          onAddAlias={handleAddAlias}
          onRemoveAlias={handleRemoveAlias}
          adjustments={adjustments}
          onAddAdjustment={handleAddAdjustment}
          onRemoveAdjustment={handleRemoveAdjustment}
          paymentPreferences={paymentPreferences}
          onPaymentPreferencesChange={setPaymentPreferences}
          isolations={isolations}
          onIsolationsChange={setIsolations}
          note={note}
          onNoteChange={setNote}
          onFinalize={handleFinalize}
          finalizing={finalizing}
          rounding={{ enabled: roundToDollars, onChange: setRoundToDollars }}
        />

        <EphemeralMobilePanels
          activeTab={activeTab}
          parsedLedger={parsedLedger}
          balances={balances}
          plan={plan}
          unitOverride={unitOverride}
          onUnitChange={setUnitOverride}
          highlightedPlayerId={highlightedPlayerId}
          onHighlight={setHighlightedPlayerId}
          aliasPanelPlayers={aliasPanelPlayers}
          aliasPanelRows={aliasPanelRows}
          onAddAlias={handleAddAlias}
          onRemoveAlias={handleRemoveAlias}
          adjustments={adjustments}
          onAddAdjustment={handleAddAdjustment}
          onRemoveAdjustment={handleRemoveAdjustment}
          paymentPreferences={paymentPreferences}
          onPaymentPreferencesChange={setPaymentPreferences}
          isolations={isolations}
          onIsolationsChange={setIsolations}
          note={note}
          onNoteChange={setNote}
          onFinalize={handleFinalize}
          finalizing={finalizing}
          rounding={{ enabled: roundToDollars, onChange: setRoundToDollars }}
        />
      </main>
    </>
  );
}
