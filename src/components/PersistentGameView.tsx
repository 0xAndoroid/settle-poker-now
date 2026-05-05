import { useCallback, useEffect, useMemo, useState } from 'react';
import { LedgerPanel } from './LedgerPanel';
import { ModificationsPanel } from './ModificationsPanel';
import { SettlementPanel, type PaymentCompletion } from './SettlementPanel';
import { IdentityPrompt } from './IdentityPrompt';
import { AuditLogPanel } from './AuditLogPanel';
import { MobileTabs, type PersistentTabKey } from './MobileTabs';
import type { TickerItem } from './Masthead';
import { usePersistentGame } from '@/hooks/usePersistentGame';
import { useGameIdentity } from '@/hooks/useGameIdentity';
import { gamePath } from '@/lib/routing';
import { copyText } from '@/lib/clipboard';
import { formatDollars } from '@/lib/money';
import { DEFAULT_PAYMENT_NOTE } from '@/lib/paymentLinks';
import { projectSettlementPlan } from '@/lib/persistedProjection';
import type {
  EffectiveBalance,
  LedgerRow,
  PersistedGameSnapshot,
  PersistedPaymentMethod,
  SettlementPlan,
} from '@/lib/types';

interface PersistentGameViewProps {
  gameId: string;
  onTickerChange: (ticker: TickerItem[] | undefined) => void;
  pushToast: (message: string, variant?: 'success' | 'error' | 'info') => void;
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
}: PersistentGameViewProps) {
  const { identity, setIdentity } = useGameIdentity(gameId);
  const actorLabel = identity?.nickname ?? null;

  const { state, togglePayment, savePaymentMethods, saveNote, finalizeLegacy } =
    usePersistentGame(gameId, actorLabel, {
      onError: (message) => pushToast(message, 'error'),
    });

  const [activeTab, setActiveTab] = useState<PersistentTabKey>('payments');

  // Project the persisted snapshot into the same shape the panels expect.
  // Read-only: we render the ORIGINAL ledger (pre-modification players)
  // and surface the post-mod settlement plan separately.
  const projection = useMemo(
    () => (state.game ? projectSnapshot(state.game) : null),
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

  // Push ticker updates upward whenever the snapshot changes.
  useEffect(() => {
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
    pushToast(
      ok ? 'link copied' : 'could not share or copy link',
      ok ? 'success' : 'error'
    );
  }, [gameId, pushToast]);

  const handleFinalizeLegacy = useCallback(async () => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'Finalize this game?\n\n' +
          'After finalizing, no one can add more aliases, prior payments, or private rules. ' +
          'Marking payments complete still works.'
      )
    ) {
      return;
    }
    await finalizeLegacy();
    pushToast('game finalized ✓', 'success');
  }, [finalizeLegacy, pushToast]);

  if (state.status === 'loading' && !projection) {
    return <CenterMessage label="loading game" />;
  }
  if (state.status === 'error' || !projection || !state.game) {
    return (
      <CenterMessage
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
    state.game.aliases.length +
    state.game.adjustments.length +
    state.game.isolations.length;

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
              <span className="ticker-label-strong text-warn">
                ⚠ legacy game · not finalized
              </span>
              <button
                type="button"
                onClick={handleFinalizeLegacy}
                className="btn btn-fill btn-sm"
              >
                finalize ›
              </button>
            </div>
            <p className="px-4 py-3 text-[12.5px] text-fg-dim leading-relaxed">
              This game was created before finalize-on-create existed. Click
              finalize to lock the plan in. Marking payments works either way.
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

        <div className="hidden lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-6">
          <div className="space-y-5">
            <LedgerPanel
              rows={projection.originalRows}
              effectiveBalances={projection.originalBalances}
              unit={state.game.game.sourceUnit}
              unitWasInferred={state.game.game.unitProvenance !== 'header'}
              hasUserOverride={state.game.game.unitProvenance === 'user'}
            />
            <ModificationsPanel
              players={state.game.players}
              aliases={state.game.aliases}
              adjustments={state.game.adjustments}
              isolations={state.game.isolations}
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
              onShare={handleShare}
              paymentMethodsByPlayerId={paymentMethodsByPlayerId}
              gameNote={state.game.game.note}
              pushToast={pushToast}
            />
            <AuditLogPanel
              entries={state.game.audit}
              players={state.game.players}
            />
            <PersistentColophon
              gameId={gameId}
              isFinalized={isFinalized}
              finalizedAt={state.game.game.finalizedAt}
              finalizedBy={state.game.game.finalizedBy}
              note={state.game.game.note}
              onSaveNote={saveNote}
            />
          </div>
        </div>

        {/* Mobile tabbed layout */}
        <div className="lg:hidden space-y-5">
          {activeTab === 'ledger' && (
            <LedgerPanel
              rows={projection.originalRows}
              effectiveBalances={projection.originalBalances}
              unit={state.game.game.sourceUnit}
              unitWasInferred={state.game.game.unitProvenance !== 'header'}
              hasUserOverride={state.game.game.unitProvenance === 'user'}
            />
          )}
          {activeTab === 'mods' && (
            <ModificationsPanel
              players={state.game.players}
              aliases={state.game.aliases}
              adjustments={state.game.adjustments}
              isolations={state.game.isolations}
            />
          )}
          {activeTab === 'payments' && (
            <SettlementPanel
              plan={plan}
              balances={projection.balances}
              paymentIds={paymentIds}
              completionByPaymentId={completionByPaymentId}
              onTogglePayment={togglePayment}
              onCopyLink={handleCopyLink}
              onShare={handleShare}
              paymentMethodsByPlayerId={paymentMethodsByPlayerId}
              gameNote={state.game.game.note}
              pushToast={pushToast}
            />
          )}
          {activeTab === 'history' && (
            <AuditLogPanel
              entries={state.game.audit}
              players={state.game.players}
            />
          )}
        </div>
      </main>
    </>
  );
}

/* ──────── Helpers ──────── */

interface Projection {
  /** Pre-modification rows — exactly as PokerNow returned them. */
  originalRows: LedgerRow[];
  /**
   * Same player set as `originalRows` but in EffectiveBalance shape so
   * the ledger panel can render. originalNet === effectiveNet here
   * (modifications go in the separate ModificationsPanel).
   */
  originalBalances: EffectiveBalance[];
  /**
   * Post-modification balances (used by SettlementPanel for nickname
   * lookup in case aliases collapsed the roster).
   */
  balances: EffectiveBalance[];
  plan: SettlementPlan;
}

function projectSnapshot(snap: PersistedGameSnapshot): Projection {
  // ORIGINAL ledger — the un-modified PokerNow snapshot. We never collapse
  // aliases here because the user wants to see who actually played.
  const originalRows: LedgerRow[] = snap.players.map((p) => ({
    playerId: p.playerId,
    nickname: p.nickname,
    netCents: p.netCents,
    buyInCents: 0,
    buyOutCents: 0,
  }));
  const originalBalances: EffectiveBalance[] = snap.players.map((p) => ({
    playerId: p.playerId,
    nickname: p.nickname,
    originalNetCents: p.netCents,
    effectiveNetCents: p.netCents,
  }));

  // Post-modification roster: alias the players, then settle. Same pipeline
  // the worker uses on rederive — we only need the nickname-by-id resolver
  // for the SettlementPanel here, since the persisted `payments` rows
  // already hold the canonical from/to ids.
  const aliasMap = new Map<string, string>();
  for (const a of snap.aliases) aliasMap.set(a.playerId, a.aliasToPlayerId);
  const canonicalNameOf = (id: string): string => {
    let cur = id;
    let hops = 0;
    while (aliasMap.has(cur) && hops++ < 16) cur = aliasMap.get(cur)!;
    const player = snap.players.find((p) => p.playerId === cur);
    return player?.nickname ?? cur;
  };
  const balances: EffectiveBalance[] = snap.players
    .filter((p) => !aliasMap.has(p.playerId))
    .map((p) => ({
      playerId: p.playerId,
      nickname: canonicalNameOf(p.playerId),
      originalNetCents: p.netCents,
      effectiveNetCents: p.netCents,
    }));
  // Sum aliased players' nets into their canonicals so the panel's
  // outstanding ledger lookups still find a row.
  for (const a of snap.aliases) {
    let target = a.aliasToPlayerId;
    let hops = 0;
    while (aliasMap.has(target) && hops++ < 16) {
      target = aliasMap.get(target)!;
    }
    const slot = balances.find((b) => b.playerId === target);
    const folded = snap.players.find((p) => p.playerId === a.playerId);
    if (slot && folded) {
      slot.originalNetCents += folded.netCents;
      slot.effectiveNetCents += folded.netCents;
    }
  }
  // Replay adjustments on the collapsed roster.
  for (const adj of snap.adjustments) {
    let fromId = adj.fromPlayerId;
    let toId = adj.toPlayerId;
    let hops = 0;
    while (aliasMap.has(fromId) && hops++ < 16) fromId = aliasMap.get(fromId)!;
    hops = 0;
    while (aliasMap.has(toId) && hops++ < 16) toId = aliasMap.get(toId)!;
    if (fromId === toId) continue;
    const from = balances.find((b) => b.playerId === fromId);
    const to = balances.find((b) => b.playerId === toId);
    if (!from || !to) continue;
    from.effectiveNetCents += adj.amountCents;
    to.effectiveNetCents -= adj.amountCents;
  }

  const plan = projectSettlementPlan(snap);
  return { originalRows, originalBalances, balances, plan };
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

interface PersistentColophonProps {
  gameId: string;
  isFinalized: boolean;
  finalizedAt: number | null;
  finalizedBy: string | null;
  note: string | null;
  onSaveNote: (next: string | null) => Promise<void>;
}

function PersistentColophon({
  gameId,
  isFinalized,
  finalizedAt,
  finalizedBy,
  note,
  onSaveNote,
}: PersistentColophonProps) {
  const stamp = finalizedAt
    ? new Date(finalizedAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : null;
  return (
    <aside className="card p-5 text-[12.5px] leading-relaxed text-fg-dim">
      <p className="ticker-label-strong mb-2">¶ persistent link</p>
      <p>
        <span className="text-fg font-semibold">/g/{gameId}</span> is the
        canonical URL for this game. Anyone with the link sees the same live
        state — including which payments have been marked settled.
      </p>
      <hr className="hr my-3" />
      {isFinalized && stamp && (
        <p className="mb-3">
          <span className="pill pill-accent">finalized</span>{' '}
          <span className="text-fg font-semibold">{stamp}</span>
          {finalizedBy ? (
            <>
              {' '}
              <span className="text-fg-mute">·</span>{' '}
              <span className="text-fg font-semibold">{finalizedBy}</span>
            </>
          ) : null}
        </p>
      )}
      <NoteEditor note={note} onSave={onSaveNote} />
      <hr className="hr my-3" />
      <p>
        Polling every 8s while this tab is open. Marking a payment refreshes
        all open viewers.
      </p>
    </aside>
  );
}

/**
 * Inline editor for the per-game note (Venmo deep-link `note=` param).
 * Read-only display by default — click "edit" to swap into a text input
 * + save/cancel. Local form state stays in `useState` (the parent's note
 * prop is read into a ref-equivalent on enter-edit so a poll-tick refresh
 * doesn't clobber typing).
 */
function NoteEditor({
  note,
  onSave,
}: {
  note: string | null;
  onSave: (next: string | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const display = note && note.trim().length > 0 ? note : DEFAULT_PAYMENT_NOTE;
  const isDefault = !note || note.trim().length === 0;

  const enterEdit = () => {
    setDraft(note ?? '');
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft('');
  };

  const submit = async () => {
    setSaving(true);
    const trimmed = draft.trim();
    try {
      await onSave(trimmed.length > 0 ? trimmed : null);
      setEditing(false);
      setDraft('');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <p className="flex items-baseline gap-2 flex-wrap">
        <span className="ticker-label">venmo note ·</span>
        <span
          className={
            isDefault ? 'text-fg-dim italic' : 'text-fg font-semibold'
          }
        >
          {display}
        </span>
        <button
          type="button"
          onClick={enterEdit}
          className="ticker-label text-accent hover:text-fg"
          aria-label="Edit Venmo note"
        >
          ✎ edit
        </button>
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <label htmlFor="note-editor-input" className="ticker-label block">
        venmo note
      </label>
      <input
        id="note-editor-input"
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={DEFAULT_PAYMENT_NOTE}
        maxLength={80}
        className="field w-full font-mono text-[13px]"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        autoFocus
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="btn btn-fill btn-sm"
        >
          {saving ? 'saving…' : 'save ›'}
        </button>
        <button
          type="button"
          onClick={cancelEdit}
          disabled={saving}
          className="btn btn-ghost btn-sm"
        >
          cancel
        </button>
      </div>
    </div>
  );
}
