import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChipBankPanel } from './ChipBankPanel';
import { HostRecoveryPanel } from './HostRecoveryPanel';
import { LiveActivityPanel } from './LiveActivityPanel';
import { LiveFinalizePanel } from './LiveFinalizePanel';
import { LivePlayersPanel } from './LivePlayersPanel';
import { LiveIsolationRulesPanel } from './LiveIsolationRulesPanel';
import { LivePriorPaymentsPanel } from './LivePriorPaymentsPanel';
import { SyncStatusPanel } from './SyncStatusPanel';
import type { TickerItem } from './Masthead';
import { useLiveGame } from '@/hooks/useLiveGame';
import { formatDollars } from '@/lib/money';
import { gamePath, navigate } from '@/lib/routing';
import type { IsolationRule } from '@/lib/types';

interface LiveGameViewProps {
  gameId: string;
  onTickerChange: (ticker: TickerItem[] | undefined) => void;
  pushToast: (message: string, variant?: 'success' | 'error' | 'info') => void;
}

export function LiveGameView({ gameId, onTickerChange, pushToast }: LiveGameViewProps) {
  const live = useLiveGame(gameId, {
    onError: (message) => pushToast(message, 'error'),
  });
  const [finalizing, setFinalizing] = useState(false);
  const [isolations, setIsolations] = useState<IsolationRule[]>([]);

  const snapshot = live.state.game;
  const liveUrl = useMemo(() => {
    if (typeof window === 'undefined') return `/live/${gameId}`;
    return `${window.location.origin}/live/${gameId}`;
  }, [gameId]);

  useEffect(() => {
    if (!snapshot) {
      onTickerChange(undefined);
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
  }, [live.pendingCount, onTickerChange, snapshot]);

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

  if (live.state.status === 'loading' && !snapshot) {
    return <CenterMessage label="loading live game" />;
  }
  if (live.state.status === 'error' || !snapshot) {
    return (
      <CenterMessage
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
        onFinalize={handleFinalize}
      />
    ),
  };

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8 pb-24">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.85fr)] lg:gap-6">
        <div className="space-y-5">
          {panels.players}
          {panels.priorPayments}
          {panels.isolationRules}
          {panels.activity}
        </div>

        <div className="mt-5 lg:mt-0 lg:sticky lg:top-[88px] lg:self-start space-y-5">
          <SyncStatusPanel
            syncState={live.syncState}
            pendingCount={live.pendingCount}
            liveUrl={liveUrl}
            onToast={pushToast}
          />
          {panels.bank}
          {panels.finalize}
          <HostRecoveryPanel liveUrl={liveUrl} />
        </div>
      </div>
    </main>
  );
}

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
        {body && <div className="px-5 py-6 text-[14px] text-fg-dim leading-relaxed">{body}</div>}
      </div>
    </div>
  );
}
