import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PaymentCompletion } from './SettlementPanel';
import { IdentityPrompt } from './IdentityPrompt';
import { MobileTabs, type PersistentTabKey } from './MobileTabs';
import { CenteredStatusCard } from './CenteredStatusCard';
import { PersistentDesktopPanels, PersistentMobilePanels } from './PersistentGamePanels';
import type { TickerItem } from './Masthead';
import type { ConfirmFn } from '@/hooks/useConfirmDialog';
import { usePersistentGame } from '@/hooks/usePersistentGame';
import { useGameIdentity } from '@/hooks/useGameIdentity';
import { gamePath } from '@/lib/routing';
import { copyText } from '@/lib/clipboard';
import { formatDollars } from '@/lib/money';
import { canonicalOf, buildCanonicalMap } from '@/lib/aliases';
import { projectPersistedSnapshot } from '@/lib/persistedProjection';
import type { PersistedPaymentMethod } from '@/lib/types';

interface PersistentGameViewProps {
  gameId: string;
  onTickerChange: (ticker: TickerItem[] | undefined) => void;
  pushToast: (message: string, variant?: 'success' | 'error' | 'info') => void;
  confirm: ConfirmFn;
}

/**
 * Post-finalize read-only view at /g/:id. Owns:
 *   - Server snapshot fetch + 8s polling (via `usePersistentGame`)
 *   - Identity selection per game (localStorage) + Venmo/Zelle registration
 *   - Mark-payment-settled toggle (the only structural mutation allowed
 *     after finalize — the worker enforces a 423 lock on everything else)
 *   - Read-only display: original ledger, modifications applied at
 *     finalize, settlement plan, audit history.
 *   - Copy-link / share-link to push the canonical URL through chat.
 *
 * Legacy unfinalized games (created via the old POST /api/games before
 * finalize-on-create existed) render with a banner offering to lock them.
 */
export function PersistentGameView({
  gameId,
  onTickerChange,
  pushToast,
  confirm,
}: PersistentGameViewProps) {
  const { identity, setIdentity } = useGameIdentity(gameId);
  const actorLabel = identity?.nickname ?? null;

  const { state, togglePayment, savePaymentMethods, saveNote, finalizeLegacy } = usePersistentGame(
    gameId,
    actorLabel,
    {
      onError: (message) => pushToast(message, 'error'),
    }
  );

  const [activeTab, setActiveTab] = useState<PersistentTabKey>('payments');

  // Project the persisted snapshot into the same shape the panels expect.
  // Read-only: we render the ORIGINAL ledger (pre-modification players)
  // and surface the post-mod settlement plan separately.
  const projection = useMemo(
    () => (state.game ? projectPersistedSnapshot(state.game) : null),
    [state.game]
  );

  const game = state.game;
  const paymentMethodsByPlayerId = useMemo(() => {
    const map = new Map<string, PersistedPaymentMethod>();
    if (!game) return map;
    for (const m of game.paymentMethods ?? []) {
      map.set(m.playerId, m);
    }
    return map;
  }, [game]);
  const currentPaymentPlayerId = useMemo(() => {
    if (!identity || !game) return null;
    return canonicalOf(identity.playerId, buildCanonicalMap(game.aliases));
  }, [game, identity]);

  // Push ticker updates upward whenever the snapshot changes.
  useEffect(() => {
    if (!projection || !state.game) {
      onTickerChange(undefined);
      return;
    }
    const settled = state.game.payments.filter((p) => p.completedAt !== null).length;
    const totalMoved = state.game.payments.reduce((acc, p) => acc + p.amountCents, 0);
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
    if (typeof document !== 'undefined') {
      document.title =
        settled === state.game.payments.length && state.game.payments.length > 0
          ? `Settled · ${state.game.players.length} players · ${formatDollars(totalMoved, {
              fixedDecimals: false,
            })} moved`
          : `Settlement · ${state.game.players.length} players · ${state.game.payments.length} payments`;
    }
  }, [onTickerChange, projection, state.game]);

  const handleCopyLink = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const fullUrl = `${window.location.origin}${gamePath(gameId)}`;
    const ok = await copyText(fullUrl);
    pushToast(
      ok ? 'link copied — paste in chat for a live preview' : 'could not copy link',
      ok ? 'success' : 'error'
    );
  }, [gameId, pushToast]);

  const handleShare = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const fullUrl = `${window.location.origin}${gamePath(gameId)}`;
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'settle.andrew.ee — settlement',
          url: fullUrl,
        });
        return;
      } catch (err) {
        // AbortError = user dismissed the sheet; not an error worth toasting.
        if ((err as Error).name === 'AbortError') return;
      }
    }
    const ok = await copyText(fullUrl);
    pushToast(ok ? 'link copied' : 'could not share or copy link', ok ? 'success' : 'error');
  }, [gameId, pushToast]);

  const handleFinalizeLegacy = useCallback(async () => {
    const confirmed = await confirm({
      title: 'Finalize this game?',
      confirmLabel: 'finalize',
      body: (
        <p>
          After finalizing, no one can add more aliases, prior payments, or private rules. Marking
          payments complete still works.
        </p>
      ),
    });
    if (!confirmed) return;
    const finalized = await finalizeLegacy();
    if (finalized) pushToast('game finalized ✓', 'success');
  }, [confirm, finalizeLegacy, pushToast]);

  if (state.status === 'loading' && !projection) {
    return <CenteredStatusCard label="loading game" />;
  }
  if (state.status === 'error' || !projection || !state.game) {
    return (
      <CenteredStatusCard
        label="not found"
        body={state.error ?? `No persistent game with id "${gameId}".`}
      />
    );
  }

  const showIdentityPrompt = identity === null && !sessionDeclined();
  const isFinalized = state.game.game.finalizedAt !== null;

  // Map current persisted plan ordering to txn list.
  const plan = projection.plan;
  const paymentIds: string[] = state.game.payments.map((p) => p.id);
  const completionByPaymentId = new Map<string, PaymentCompletion>(
    state.game.payments.map((p) => [
      p.id,
      { completedAt: p.completedAt, completedBy: p.completedBy },
    ])
  );
  const modsTotal =
    state.game.aliases.length + state.game.adjustments.length + state.game.isolations.length;

  return (
    <>
      <MobileTabs
        mode="persistent"
        active={activeTab}
        onChange={setActiveTab}
        txnCount={plan.txns.length}
        playerCount={projection.originalRows.length}
        modsCount={modsTotal}
        historyCount={state.game.audit.length}
      />

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8 pb-24">
        {!isFinalized && (
          <div className="mb-5 card border-warn/60">
            <div className="card-header bg-warn/[0.08]">
              <span className="ticker-label-strong text-warn">⚠ legacy game · not finalized</span>
              <button
                type="button"
                onClick={() => void handleFinalizeLegacy()}
                className="btn btn-fill btn-sm"
              >
                finalize ›
              </button>
            </div>
            <p className="px-4 py-3 text-[12.5px] text-fg-dim leading-relaxed">
              This game was created before finalize-on-create existed. Click finalize to lock the
              plan in. Marking payments works either way.
            </p>
          </div>
        )}

        {showIdentityPrompt && (
          <div className="mb-6">
            <IdentityPrompt
              players={state.game.players}
              paymentMethodsByPlayerId={paymentMethodsByPlayerId}
              onPick={(result) => {
                if (result.player) {
                  setIdentity(result.player);
                  pushToast(`identified as ${result.player.nickname}`, 'info');
                  if (result.paymentMethods) {
                    void savePaymentMethods({
                      playerId: result.player.playerId,
                      ...result.paymentMethods,
                    });
                  }
                } else {
                  declineIdentity();
                  setIdentity(null);
                  pushToast('continuing as spectator', 'info');
                }
              }}
            />
          </div>
        )}

        <PersistentDesktopPanels
          gameId={gameId}
          snapshot={state.game}
          projection={projection}
          paymentIds={paymentIds}
          completionByPaymentId={completionByPaymentId}
          onTogglePayment={togglePayment}
          onCopyLink={handleCopyLink}
          onShare={handleShare}
          paymentMethodsByPlayerId={paymentMethodsByPlayerId}
          currentPaymentPlayerId={currentPaymentPlayerId}
          pushToast={pushToast}
          isFinalized={isFinalized}
          onSaveNote={saveNote}
        />

        <PersistentMobilePanels
          activeTab={activeTab}
          gameId={gameId}
          snapshot={state.game}
          projection={projection}
          paymentIds={paymentIds}
          completionByPaymentId={completionByPaymentId}
          onTogglePayment={togglePayment}
          onCopyLink={handleCopyLink}
          onShare={handleShare}
          paymentMethodsByPlayerId={paymentMethodsByPlayerId}
          currentPaymentPlayerId={currentPaymentPlayerId}
          pushToast={pushToast}
          isFinalized={isFinalized}
          onSaveNote={saveNote}
        />
      </main>
    </>
  );
}

/* ──────── In-memory "skip identity" flag ──────── */

let identityDeclined = false;
function declineIdentity(): void {
  identityDeclined = true;
}
function sessionDeclined(): boolean {
  return identityDeclined;
}
