import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState } from './EmptyState';
import { LedgerPanel } from './LedgerPanel';
import { SettlementPanel } from './SettlementPanel';
import { IsolationPanel } from './IsolationPanel';
import { AdjustmentsPanel } from './AdjustmentsPanel';
import { AliasPanel } from './AliasPanel';
import { PaymentPreferencesPanel } from './PaymentPreferencesPanel';
import { LoadingView } from './LoadingView';
import { ErrorView } from './ErrorView';
import { MobileTabs, type EphemeralTabKey } from './MobileTabs';
import type { TickerItem } from './Masthead';
import { useLedger } from '@/hooks/useLedger';
import { computePlan } from '@/lib/settle';
import { LedgerParseError, parseLedgerCsv } from '@/lib/csv';
import { readHashFromLocation, writeHashToLocation } from '@/lib/hashState';
import { formatDollars } from '@/lib/money';
import { DEFAULT_PAYMENT_NOTE } from '@/lib/paymentLinks';
import { ApiError, createFinalizedGame } from '@/lib/apiClient';
import { gamePath, navigate } from '@/lib/routing';
import { type AliasRule, canonicalize } from '@/lib/aliases';
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
  onResetRequest: () => void;
  /**
   * Imperatively register a reset handler so the parent's "new game" button
   * in the masthead can clear our state. We pass our `reset` up via a ref.
   */
  registerReset?: (reset: () => void) => void;
  pushToast: (message: string, variant?: 'success' | 'error' | 'info') => void;
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
  const [aliases, setAliases] = useState<AliasRule[]>([]);
  const [paymentPreferences, setPaymentPreferences] = useState<PaymentPreference[]>([]);
  const [unitOverride, setUnitOverride] = useState<LedgerUnit | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<EphemeralTabKey>('ledger');
  const [highlightedPlayerId, setHighlightedPlayerId] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [note, setNote] = useState('');

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
      parsedLedger.rows,
      adjustments,
      isolations,
      aliases,
      paymentPreferences
    );
  }, [parsedLedger, adjustments, isolations, aliases, paymentPreferences]);

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
    const noteForConfirm =
      trimmedNote.length > 0 ? trimmedNote : DEFAULT_PAYMENT_NOTE;
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Finalize this game with note: "${noteForConfirm}"?\n\n` +
          'The settlement plan will lock and a shareable link will be minted. ' +
          'You can still mark payments complete, but you will not be able to add more aliases / adjustments / private rules.'
      )
    ) {
      return;
    }
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
        note: trimmedNote.length > 0 ? trimmedNote : null,
      });
      navigate(gamePath(game.game.id));
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not finalize game.';
      pushToast(message, 'error');
      setFinalizing(false);
    }
  }, [adjustments, aliases, isolations, ledgerState.gameId, note, parsedLedger, paymentPreferences, plan.cyclePlayerIds.length, pushToast]);

  const reset = useCallback(() => {
    resetLedger();
    setAdjustments([]);
    setIsolations([]);
    setAliases([]);
    setPaymentPreferences([]);
    setUnitOverride(null);
    setParseError(null);
    setNote('');
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

  const errorMessage =
    parseError ??
    (ledgerState.status === 'error' ? ledgerState.error ?? 'unknown error' : null);

  if (ledgerState.status === 'idle') {
    return <EmptyState onAnalyze={handleAnalyze} />;
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
        mode="ephemeral"
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
            <AliasPanel
              players={aliasPanelPlayers}
              aliases={aliasPanelRows}
              onAddAlias={handleAddAlias}
              onRemoveAlias={handleRemoveAlias}
            />
            <AdjustmentsPanel
              balances={balances}
              adjustments={adjustments}
              onAdd={handleAddAdjustment}
              onRemove={handleRemoveAdjustment}
            />
            <PaymentPreferencesPanel
              balances={balances}
              preferences={paymentPreferences}
              onChange={setPaymentPreferences}
            />
            <IsolationPanel
              balances={balances}
              isolations={isolations}
              cyclePlayerIds={plan.cyclePlayerIds}
              onChange={setIsolations}
            />
          </div>
          <div className="lg:sticky lg:top-[88px] lg:self-start space-y-5">
            <NotePromptCard value={note} onChange={setNote} />
            <SettlementPanel
              plan={plan}
              balances={balances}
              onHighlight={setHighlightedPlayerId}
              onFinalize={handleFinalize}
              finalizing={finalizing}
            />
            <Colophon />
          </div>
        </div>

        <div className="lg:hidden space-y-5">
          {activeTab === 'ledger' && (
            <>
              <LedgerPanel
                rows={parsedLedger.rows}
                effectiveBalances={balances}
                unit={parsedLedger.unit}
                unitWasInferred={parsedLedger.unitWasInferred}
                hasUserOverride={unitOverride !== null}
                onUnitChange={setUnitOverride}
              />
              <NotePromptCard value={note} onChange={setNote} />
              <SettlementPanel
                plan={plan}
                balances={balances}
                onFinalize={handleFinalize}
                finalizing={finalizing}
              />
            </>
          )}
          {activeTab === 'config' && (
            <>
              <AliasPanel
                players={aliasPanelPlayers}
                aliases={aliasPanelRows}
                onAddAlias={handleAddAlias}
                onRemoveAlias={handleRemoveAlias}
              />
              <AdjustmentsPanel
                balances={balances}
                adjustments={adjustments}
                onAdd={handleAddAdjustment}
                onRemove={handleRemoveAdjustment}
              />
              <PaymentPreferencesPanel
                balances={balances}
                preferences={paymentPreferences}
                onChange={setPaymentPreferences}
              />
              <IsolationPanel
                balances={balances}
                isolations={isolations}
                cyclePlayerIds={plan.cyclePlayerIds}
                onChange={setIsolations}
              />
            </>
          )}
        </div>
      </main>
    </>
  );
}

/**
 * Pre-finalize note input. Lives above the settlement panel; the value
 * threads into the Venmo deep-link `note=` query param when the game is
 * finalized. Stored only in component state — no localStorage round-trip
 * (mirrors the IdentityPrompt fix that prevents poll-driven resets).
 */
function NotePromptCard({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <section aria-labelledby="note-prompt-heading" className="card">
      <div className="card-header">
        <span id="note-prompt-heading" className="ticker-label-strong">
          venmo note
        </span>
        <span className="ticker-label">used on payment links</span>
      </div>
      <div className="px-4 py-4 space-y-2">
        <p className="text-[12.5px] text-fg-dim leading-relaxed">
          Customize what shows up in the recipient's Venmo when someone
          taps to pay. Defaults to <span className="text-fg font-semibold">{DEFAULT_PAYMENT_NOTE}</span>.
        </p>
        <input
          id="note-prompt-input"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={DEFAULT_PAYMENT_NOTE}
          maxLength={80}
          className="field w-full font-mono text-[13px]"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="Venmo note (optional)"
        />
      </div>
    </section>
  );
}

function Colophon() {
  return (
    <aside className="card p-5 text-[12.5px] leading-relaxed text-fg-dim">
      <p className="ticker-label-strong mb-2">¶ how it works</p>
      <p>
        <span className="text-fg font-semibold">Optimal subset-sum partitioning.</span>
        {' '}Solves min-transactions exactly for N ≤ 15 players via bitmask DP — partitions
        the table into the maximum number of disjoint zero-sum subsets, each settling in
        k − 1 internal payments. Provably minimum, not a heuristic. Greedy
        max-creditor↔max-debtor fallback for tables larger than 15. Integer cents
        throughout — no float drift.
      </p>
      <hr className="hr my-3" />
      <p>
        <span className="text-fg font-semibold">Finalize → shareable link.</span> Add
        aliases / prior payments / private rules first. When the plan looks right, hit
        finalize: the settlement plan is snapshotted to a persistent `/g/&lt;id&gt;` URL
        your group can mark off as they pay.
      </p>
    </aside>
  );
}
