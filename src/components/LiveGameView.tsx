import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChipBankPanel } from './ChipBankPanel';
import { HostRecoveryPanel } from './HostRecoveryPanel';
import { LiveActivityPanel } from './LiveActivityPanel';
import { LiveFinalizePanel } from './LiveFinalizePanel';
import { LivePlayersPanel } from './LivePlayersPanel';
import { LiveIsolationRulesPanel } from './LiveIsolationRulesPanel';
import { LivePriorPaymentsPanel } from './LivePriorPaymentsPanel';
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

  const snapshot = live.state.game;
  const liveUrl = useMemo(() => {
    if (typeof window === 'undefined') return `/live/${gameId}`;
    return `${window.location.origin}/live/${gameId}`;
  }, [gameId]);

  useEffect(() => {
    if (!snapshot) {
      onTickerChange(undefined);
      if (typeof document !== 'undefined') {
        document.title = `Live · ${gameId} · settle.andrew.ee`;
      }
      return;
    }
    const bankIssues =
      (snapshot.bankSummary.latestTableDeltaCents ? 1 : 0) +
      (snapshot.bankSummary.latestBankDeltaCents ? 1 : 0);
    const ticker: TickerItem[] = [
      { label: 'live', value: snapshot.game.status, tone: 'accent' },
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
  }, [gameId, live.pendingCount, onTickerChange, snapshot]);

  const handleFinalize = useCallback(
    async (force: boolean, rules: IsolationRule[]) => {
      setFinalizing(true);
      try {
        const result = await live.finalize(force, rules);
        if (result) {
          pushToast('live game finalized', 'success');
          navigate(result.redirectPath);
        }
      } finally {
        setFinalizing(false);
      }
    },
    [live, pushToast]
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
  };

  return (
    <main className="mx-auto max-w-6xl px-3 sm:px-6 py-3 sm:py-8 pb-16 sm:pb-24">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.85fr)] lg:gap-6">
        <div className="space-y-3 sm:space-y-5">
          {panels.players}
          {panels.priorPayments}
          {panels.isolationRules}
          {panels.activity}
        </div>

        <div className="mt-3 sm:mt-5 lg:mt-0 lg:sticky lg:top-[88px] lg:self-start space-y-3 sm:space-y-5">
          <SyncStatusPanel
            syncState={live.syncState}
            pendingCount={live.pendingCount}
            liveUrl={liveUrl}
            onToast={pushToast}
          />
          {panels.bank}
          {panels.finalize}
          <HostRecoveryPanel
            liveUrl={liveUrl}
            deleting={deleting}
            onDelete={() => void handleDelete()}
          />
        </div>
      </div>
    </main>
  );
}
