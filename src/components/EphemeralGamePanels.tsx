import type { Dispatch, SetStateAction } from 'react';
import { AdjustmentsPanel } from './AdjustmentsPanel';
import { AliasPanel } from './AliasPanel';
import { IsolationPanel } from './IsolationPanel';
import { LedgerPanel } from './LedgerPanel';
import { PaymentPreferencesPanel } from './PaymentPreferencesPanel';
import { SettlementPanel } from './SettlementPanel';
import type { EphemeralTabKey } from './MobileTabs';
import { DEFAULT_PAYMENT_NOTE } from '@/lib/paymentLinks';
import type { AliasRule } from '@/lib/aliases';
import type {
  Adjustment,
  EffectiveBalance,
  IsolationRule,
  LedgerUnit,
  ParsedLedger,
  PaymentPreference,
  PersistedAlias,
  PersistedPlayer,
  SettlementPlan,
} from '@/lib/types';

interface EphemeralPanelsProps {
  parsedLedger: ParsedLedger;
  balances: EffectiveBalance[];
  plan: SettlementPlan;
  unitOverride: LedgerUnit | null;
  onUnitChange: (unit: LedgerUnit | null) => void;
  highlightedPlayerId: string | null;
  onHighlight: (playerId: string | null) => void;
  aliasPanelPlayers: PersistedPlayer[];
  aliasPanelRows: PersistedAlias[];
  onAddAlias: (input: AliasRule) => Promise<void>;
  onRemoveAlias: (playerId: string) => Promise<void>;
  adjustments: Adjustment[];
  onAddAdjustment: (adj: Adjustment) => void;
  onRemoveAdjustment: (id: string) => void;
  paymentPreferences: PaymentPreference[];
  onPaymentPreferencesChange: Dispatch<SetStateAction<PaymentPreference[]>>;
  isolations: IsolationRule[];
  onIsolationsChange: Dispatch<SetStateAction<IsolationRule[]>>;
  note: string;
  onNoteChange: (next: string) => void;
  onFinalize: () => void | Promise<void>;
  finalizing: boolean;
}

export function EphemeralDesktopPanels(props: EphemeralPanelsProps) {
  return (
    <div className="hidden lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-6">
      <div className="space-y-5">
        <EphemeralLedgerPanel {...props} withHighlight />
        <EphemeralConfigPanels {...props} />
      </div>
      <div className="lg:sticky lg:top-[88px] lg:self-start space-y-5">
        <NotePromptCard value={props.note} onChange={props.onNoteChange} />
        <SettlementPanel
          plan={props.plan}
          balances={props.balances}
          onHighlight={props.onHighlight}
          onFinalize={props.onFinalize}
          finalizing={props.finalizing}
        />
        <EphemeralColophon />
      </div>
    </div>
  );
}

export function EphemeralMobilePanels({
  activeTab,
  ...props
}: EphemeralPanelsProps & { activeTab: EphemeralTabKey }) {
  return (
    <div className="lg:hidden space-y-5">
      {activeTab === 'ledger' && (
        <>
          <EphemeralLedgerPanel {...props} />
          <NotePromptCard value={props.note} onChange={props.onNoteChange} />
          <SettlementPanel
            plan={props.plan}
            balances={props.balances}
            onFinalize={props.onFinalize}
            finalizing={props.finalizing}
          />
        </>
      )}
      {activeTab === 'config' && <EphemeralConfigPanels {...props} />}
    </div>
  );
}

function EphemeralLedgerPanel({
  parsedLedger,
  balances,
  unitOverride,
  onUnitChange,
  highlightedPlayerId,
  onHighlight,
  withHighlight = false,
}: EphemeralPanelsProps & { withHighlight?: boolean }) {
  return (
    <LedgerPanel
      rows={parsedLedger.rows}
      effectiveBalances={balances}
      unit={parsedLedger.unit}
      unitWasInferred={parsedLedger.unitWasInferred}
      hasUserOverride={unitOverride !== null}
      onUnitChange={onUnitChange}
      highlightedPlayerId={withHighlight ? highlightedPlayerId : undefined}
      onHighlight={withHighlight ? onHighlight : undefined}
    />
  );
}

function EphemeralConfigPanels({
  balances,
  aliasPanelPlayers,
  aliasPanelRows,
  onAddAlias,
  onRemoveAlias,
  adjustments,
  onAddAdjustment,
  onRemoveAdjustment,
  paymentPreferences,
  onPaymentPreferencesChange,
  isolations,
  onIsolationsChange,
  plan,
}: EphemeralPanelsProps) {
  return (
    <>
      <AliasPanel
        players={aliasPanelPlayers}
        aliases={aliasPanelRows}
        onAddAlias={onAddAlias}
        onRemoveAlias={onRemoveAlias}
      />
      <AdjustmentsPanel
        balances={balances}
        adjustments={adjustments}
        onAdd={onAddAdjustment}
        onRemove={onRemoveAdjustment}
      />
      <PaymentPreferencesPanel
        balances={balances}
        preferences={paymentPreferences}
        onChange={onPaymentPreferencesChange}
      />
      <IsolationPanel
        balances={balances}
        isolations={isolations}
        cyclePlayerIds={plan.cyclePlayerIds}
        onChange={onIsolationsChange}
      />
    </>
  );
}

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
          Customize what shows up in the recipient&apos;s Venmo when someone taps to pay. Defaults
          to <span className="text-fg font-semibold">{DEFAULT_PAYMENT_NOTE}</span>.
        </p>
        <input
          id="note-prompt-input"
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
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

function EphemeralColophon() {
  return (
    <aside className="card p-5 text-[12.5px] leading-relaxed text-fg-dim">
      <p className="ticker-label-strong mb-2">¶ how it works</p>
      <p>
        <span className="text-fg font-semibold">Optimal subset-sum partitioning.</span>{' '}
        Solves min-transactions exactly for N ≤ 15 players via bitmask DP — partitions the table
        into the maximum number of disjoint zero-sum subsets, each settling in k − 1 internal
        payments. Provably minimum, not a heuristic. Greedy max-creditor↔max-debtor fallback for
        tables larger than 15. Integer cents throughout — no float drift.
      </p>
      <hr className="hr my-3" />
      <p>
        <span className="text-fg font-semibold">Finalize → shareable link.</span> Add aliases /
        prior payments / private rules first. When the plan looks right, hit finalize: the
        settlement plan is snapshotted to a persistent `/g/&lt;id&gt;` URL your group can mark off
        as they pay.
      </p>
    </aside>
  );
}
