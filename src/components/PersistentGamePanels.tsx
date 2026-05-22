import { AuditLogPanel } from './AuditLogPanel';
import { LedgerAdjustmentNotice } from './LedgerAdjustmentNotice';
import { LedgerPanel } from './LedgerPanel';
import { ModificationsPanel } from './ModificationsPanel';
import { PersistentColophon } from './PersistentColophon';
import { SettlementPanel, type PaymentCompletion } from './SettlementPanel';
import type { PersistentTabKey } from './MobileTabs';
import type { PersistedSnapshotProjection } from '@/lib/persistedProjection';
import type { PersistedGameSnapshot, PersistedPaymentMethod } from '@/lib/types';

interface PersistentPanelsProps {
  gameId: string;
  snapshot: PersistedGameSnapshot;
  projection: PersistedSnapshotProjection;
  paymentIds: string[];
  completionByPaymentId: ReadonlyMap<string, PaymentCompletion>;
  onTogglePayment: (paymentId: string, next: boolean) => void | Promise<void>;
  onCopyLink: () => void | Promise<void>;
  onShare: () => void | Promise<void>;
  paymentMethodsByPlayerId: ReadonlyMap<string, PersistedPaymentMethod>;
  currentPaymentPlayerId: string | null;
  pushToast: (message: string, variant?: 'success' | 'error' | 'info') => void;
  isFinalized: boolean;
  onSaveNote: (next: string | null) => Promise<void>;
}

export function PersistentDesktopPanels(props: PersistentPanelsProps) {
  return (
    <div className="hidden lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-6">
      <div className="space-y-5">
        <PersistentLedgerStack snapshot={props.snapshot} projection={props.projection} />
        <PersistentModifications snapshot={props.snapshot} />
      </div>
      <div className="lg:sticky lg:top-[88px] lg:self-start space-y-5">
        <PersistentSettlement {...props} />
        <AuditLogPanel entries={props.snapshot.audit} players={props.snapshot.players} />
        <PersistentColophon
          gameId={props.gameId}
          isFinalized={props.isFinalized}
          finalizedAt={props.snapshot.game.finalizedAt}
          finalizedBy={props.snapshot.game.finalizedBy}
          note={props.snapshot.game.note}
          onSaveNote={props.onSaveNote}
        />
      </div>
    </div>
  );
}

export function PersistentMobilePanels({
  activeTab,
  ...props
}: PersistentPanelsProps & { activeTab: PersistentTabKey }) {
  return (
    <div className="lg:hidden space-y-5">
      {activeTab === 'ledger' && (
        <PersistentLedgerStack snapshot={props.snapshot} projection={props.projection} />
      )}
      {activeTab === 'mods' && <PersistentModifications snapshot={props.snapshot} />}
      {activeTab === 'payments' && <PersistentSettlement {...props} />}
      {activeTab === 'history' && (
        <AuditLogPanel entries={props.snapshot.audit} players={props.snapshot.players} />
      )}
    </div>
  );
}

function PersistentLedgerStack({
  snapshot,
  projection,
}: Pick<PersistentPanelsProps, 'snapshot' | 'projection'>) {
  return (
    <>
      <LedgerPanel
        rows={projection.originalRows}
        effectiveBalances={projection.originalBalances}
        unit={snapshot.game.sourceUnit}
        unitWasInferred={snapshot.game.unitProvenance !== 'header'}
        hasUserOverride={snapshot.game.unitProvenance === 'user'}
      />
      {projection.proportionalAdjustments.length > 0 && (
        <LedgerAdjustmentNotice
          adjustments={projection.proportionalAdjustments}
          players={snapshot.players}
        />
      )}
    </>
  );
}

function PersistentModifications({ snapshot }: Pick<PersistentPanelsProps, 'snapshot'>) {
  return (
    <ModificationsPanel
      players={snapshot.players}
      aliases={snapshot.aliases}
      adjustments={snapshot.adjustments}
      isolations={snapshot.isolations}
    />
  );
}

function PersistentSettlement({
  snapshot,
  projection,
  paymentIds,
  completionByPaymentId,
  onTogglePayment,
  onCopyLink,
  onShare,
  paymentMethodsByPlayerId,
  currentPaymentPlayerId,
  pushToast,
}: PersistentPanelsProps) {
  return (
    <SettlementPanel
      plan={projection.plan}
      balances={projection.balances}
      paymentIds={paymentIds}
      completionByPaymentId={completionByPaymentId}
      onTogglePayment={onTogglePayment}
      onCopyLink={onCopyLink}
      onShare={onShare}
      paymentMethodsByPlayerId={paymentMethodsByPlayerId}
      gameNote={snapshot.game.note}
      currentPlayerId={currentPaymentPlayerId}
      pushToast={pushToast}
    />
  );
}
