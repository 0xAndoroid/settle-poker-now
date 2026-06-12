import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChipBankPanel } from './ChipBankPanel';
import { HostRecoveryPanel } from './HostRecoveryPanel';
import { LiveActivityPanel } from './LiveActivityPanel';
import { LiveFinalizePanel } from './LiveFinalizePanel';
import { LivePlayersPanel } from './LivePlayersPanel';
import { LiveIsolationRulesPanel } from './LiveIsolationRulesPanel';
import { LivePriorPaymentsPanel } from './LivePriorPaymentsPanel';
import { MobileTabs, type LiveTabKey } from './MobileTabs';
import { SyncStatusPanel } from './SyncStatusPanel';
import { CenteredStatusCard } from './CenteredStatusCard';
import type { TickerItem } from './Masthead';
import { useLiveGame } from '@/hooks/useLiveGame';
import type { ConfirmFn } from '@/hooks/useConfirmDialog';
import { deleteLiveGameRemote } from '@/lib/liveApiClient';
import { clearLiveGameLocalState } from '@/lib/liveStorage';
import { formatDollars } from '@/lib/money';
import { gamePath, navigate } from '@/lib/routing';
import { errorMessage } from '@/lib/errors';
import {
  buildLiveRecentGameEntry,
  getRecentGamesStorage,
  markRecentGameMissing,
  upsertRecentGame,
} from '@/lib/recentGames';
import type { IsolationRule } from '@/lib/types';

interface LiveGameViewProps {
  gameId: string;
  onTickerChange: (ticker: TickerItem[] | undefined) => void;
  pushToast: (message: string, variant?: 'success' | 'error' | 'info') => void;
  confirm: ConfirmFn;
}

export function LiveGameView({ gameId, onTickerChange, pushToast, confirm }: LiveGameViewProps) {
  const live = useLiveGame(gameId, {
    onError: (message) => pushToast(message, 'error'),
  });
  const [finalizing, setFinalizing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isolations, setIsolations] = useState<IsolationRule[]>([]);
  const [activeTab, setActiveTab] = useState<LiveTabKey>('table');
  const recentVisitAtRef = useRef<number | null>(null);
  const recentSignatureRef = useRef<string | null>(null);

  const snapshot = live.state.game;
  const liveUrl = useMemo(() => {
    if (typeof window === 'undefined') return `/live/${gameId}`;
    return `${window.location.origin}/live/${gameId}`;
  }, [gameId]);

  const bankIssues = snapshot
    ? (snapshot.bankSummary.latestTableDeltaCents ? 1 : 0) +
      (snapshot.bankSummary.latestBankDeltaCents ? 1 : 0)
    : 0;

  useEffect(() => {
    recentVisitAtRef.current = null;
    recentSignatureRef.current = null;
  }, [gameId]);

  useEffect(() => {
    if (live.state.status === 'error') {
      markRecentGameMissing(getRecentGamesStorage(), 'live', gameId);
    }
  }, [gameId, live.state.status]);

  useEffect(() => {
    if (!snapshot) return;
    recentVisitAtRef.current ??= Date.now();
    const entry = buildLiveRecentGameEntry({
      snapshot,
      visitedAt: recentVisitAtRef.current,
    });
    const signature = `${entry.id}:${entry.label}:${entry.status}`;
    if (recentSignatureRef.current === signature) return;
    recentSignatureRef.current = signature;
    upsertRecentGame(getRecentGamesStorage(), entry);
  }, [snapshot]);

  useEffect(() => {
    if (!snapshot) {
      onTickerChange(undefined);
      if (typeof document !== 'undefined') {
        document.title = `Live · ${gameId} · settle.andrew.ee`;
      }
      return;
    }
    const ticker: TickerItem[] = [
      { label: 'live', value: snapshot.game.status, tone: 'live' },
      { label: 'players', value: String(snapshot.players.length) },
      {
        label: 'in play',
        value: formatDollars(snapshot.bankSummary.chipsInPlayCents),
      },
      ...(live.pendingCount > 0
        ? ([
            { label: 'unsynced', value: String(live.pendingCount), tone: 'accent' },
          ] satisfies TickerItem[])
        : []),
      ...(bankIssues > 0
        ? ([{ label: 'bank', value: 'off', tone: 'loss' }] satisfies TickerItem[])
        : []),
    ];
    onTickerChange(ticker);
    if (typeof document !== 'undefined') {
      document.title = `Live · ${snapshot.players.length} players · ${formatDollars(
        snapshot.bankSummary.chipsInPlayCents,
        { fixedDecimals: false }
      )} in play`;
    }
  }, [bankIssues, gameId, live.pendingCount, onTickerChange, snapshot]);

  const handleFinalize = useCallback(
    async (force: boolean, rules: IsolationRule[]) => {
      setFinalizing(true);
      try {
        const result = await live.finalize(force, rules);
        if (result) {
          if (snapshot) {
            upsertRecentGame(
              getRecentGamesStorage(),
              buildLiveRecentGameEntry({
                snapshot: {
                  ...snapshot,
                  game: {
                    ...snapshot.game,
                    status: 'finalized',
                    finalizedAt: Date.now(),
                    finalizedGameId: result.game.game.id,
                  },
                },
              })
            );
          }
          pushToast('live game finalized', 'success');
          navigate(result.redirectPath);
        }
      } finally {
        setFinalizing(false);
      }
    },
    [live, pushToast, snapshot]
  );

  const handleDelete = useCallback(async () => {
    const confirmed = await confirm({
      title: 'Delete this live game?',
      confirmLabel: 'delete game',
      tone: 'danger',
      body: (
        <p>
          Are you sure? This will permanently delete the game and all recorded data.
        </p>
      ),
    });
    if (!confirmed) return;
    setDeleting(true);
    try {
      await deleteLiveGameRemote(gameId);
      await clearLiveGameLocalState(gameId);
      pushToast('live game deleted', 'success');
      navigate('/');
    } catch (err) {
      pushToast(errorMessage(err, 'Could not delete live game.'), 'error');
      setDeleting(false);
    }
  }, [confirm, gameId, pushToast]);

  if (live.state.status === 'loading' && !snapshot) {
    return <CenteredStatusCard label="loading live game" />;
  }
  if (live.state.status === 'error' || !snapshot) {
    return (
      <CenteredStatusCard
        label="not found"
        body={live.state.error ?? `No live game with id "${gameId}".`}
      />
    );
  }

  if (snapshot.game.status === 'finalized' && snapshot.game.finalizedGameId) {
    return (
      <main className="mx-auto max-w-2xl px-4 sm:px-6 py-8">
        <div className="card">
          <div className="card-header">
            <span className="ticker-label-strong">live game finalized</span>
            <button
              type="button"
              className="btn btn-fill btn-sm"
              onClick={() => navigate(gamePath(snapshot.game.finalizedGameId!))}
            >
              open /g
            </button>
          </div>
          <p className="px-5 py-6 text-[14px] text-fg-dim leading-relaxed">
            This live table has been finalized into{' '}
            <span className="font-mono text-fg">/g/{snapshot.game.finalizedGameId}</span>.
          </p>
        </div>
      </main>
    );
  }

  const panels = {
    players: (
      <LivePlayersPanel
        snapshot={snapshot}
        confirm={confirm}
        onAddPlayer={live.addPlayer}
        onUpdatePlayer={live.updatePlayer}
        onAddEntry={live.addEntry}
        onVoidEntry={live.voidEntry}
      />
    ),
    priorPayments: <LivePriorPaymentsPanel snapshot={snapshot} onAddEntry={live.addEntry} />,
    isolationRules: (
      <LiveIsolationRulesPanel
        snapshot={snapshot}
        isolations={isolations}
        onChange={setIsolations}
      />
    ),
    bank: <ChipBankPanel snapshot={snapshot} onAddCheckpoint={live.addChipCheckpoint} />,
    activity: (
      <LiveActivityPanel
        snapshot={snapshot}
        outboxItems={live.outboxItems}
        onVoidEntry={live.voidEntry}
      />
    ),
    sync: (
      <SyncStatusPanel
        syncState={live.syncState}
        pendingCount={live.pendingCount}
        liveUrl={liveUrl}
        onToast={pushToast}
      />
    ),
    finalize: (
      <LiveFinalizePanel
        snapshot={snapshot}
        pendingCount={live.pendingCount}
        finalizing={finalizing}
        isolations={isolations}
        confirm={confirm}
        onFinalize={handleFinalize}
      />
    ),
    recovery: (
      <HostRecoveryPanel liveUrl={liveUrl} deleting={deleting} onDelete={() => void handleDelete()} />
    ),
  };

  const priorPaymentCount = snapshot.entries.filter(
    (entry) => entry.entryType === 'prior_payment' && entry.voidedAt === null
  ).length;
  const logCount =
    snapshot.entries.length + snapshot.chipCheckpoints.length + snapshot.audit.length;

  return (
    <>
      <MobileTabs
        mode="live"
        active={activeTab}
        onChange={setActiveTab}
        playerCount={snapshot.playerSummaries.length}
        paymentsCount={priorPaymentCount}
        logCount={logCount}
        bankAlert={bankIssues > 0}
      />

      <main className="mx-auto max-w-6xl px-3 sm:px-6 py-3 sm:py-8 pb-16 sm:pb-24">
        <div className="hidden lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.85fr)] lg:gap-6">
          <div className="space-y-5 stagger">
            {panels.players}
            {panels.priorPayments}
            {panels.isolationRules}
            {panels.activity}
          </div>

          <div className="lg:sticky lg:top-[96px] lg:self-start space-y-5 stagger">
            {panels.finalize}
            {panels.sync}
            {panels.bank}
            {panels.recovery}
          </div>
        </div>

        <div className="lg:hidden space-y-3 sm:space-y-5 stagger">
          {activeTab === 'table' && (
            <>
              {panels.players}
              {panels.finalize}
            </>
          )}
          {activeTab === 'bank' && panels.bank}
          {activeTab === 'payments' && (
            <>
              {panels.priorPayments}
              {panels.isolationRules}
            </>
          )}
          {activeTab === 'log' && (
            <>
              {panels.sync}
              {panels.activity}
              {panels.recovery}
            </>
          )}
        </div>
      </main>
    </>
  );
}
