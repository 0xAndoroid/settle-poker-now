import { ledgerBalances } from './csv';
import { formatDollars, formatNet } from './money';
import type {
  Adjustment,
  LedgerRow,
  LiveBankSummary,
  LiveChipCheckpoint,
  LiveEntry,
  LiveFinalizationCheck,
  LiveFinalizationValidation,
  LiveGame,
  LiveGameSnapshot,
  LivePlayer,
  LivePlayerSummary,
  LiveProportionalAdjustment,
} from './types';

const BALANCE_TOLERANCE_CENTS = 1;

function activeEntries(entries: ReadonlyArray<LiveEntry>): LiveEntry[] {
  return entries.filter((entry) => entry.voidedAt === null);
}

function snapshotParts(
  input: LiveGameSnapshot | ReadonlyArray<LivePlayer>,
  entriesArg?: ReadonlyArray<LiveEntry>,
  checkpointsArg?: ReadonlyArray<LiveChipCheckpoint>
): {
  game: LiveGame | null;
  players: ReadonlyArray<LivePlayer>;
  entries: ReadonlyArray<LiveEntry>;
  checkpoints: ReadonlyArray<LiveChipCheckpoint>;
} {
  if ('game' in input) {
    return {
      game: input.game,
      players: input.players,
      entries: input.entries,
      checkpoints: input.chipCheckpoints,
    };
  }
  return {
    game: null,
    players: input,
    entries: entriesArg ?? [],
    checkpoints: checkpointsArg ?? [],
  };
}

export function deriveLivePlayerSummaries(
  input: LiveGameSnapshot | ReadonlyArray<LivePlayer>,
  entriesArg?: ReadonlyArray<LiveEntry>
): LivePlayerSummary[] {
  const { players, entries } = snapshotParts(input, entriesArg);
  const rows = activeEntries(entries);

  const summaryByPlayer = new Map<string, LivePlayerSummary>();
  for (const player of players) {
    summaryByPlayer.set(player.playerId, {
      playerId: player.playerId,
      name: player.name,
      isHost: player.isHost,
      status: player.status,
      buyInCents: 0,
      cashOutCents: 0,
      priorPaymentCents: 0,
      priorReceivedCents: 0,
      netCents: 0,
      entryCount: 0,
      hasActivity: false,
      hasFinalCashout: false,
      finalCashoutCents: null,
      lastEntryAt: null,
    });
  }

  const ensure = (playerId: string): LivePlayerSummary => {
    const existing = summaryByPlayer.get(playerId);
    if (existing) return existing;
    const fallback: LivePlayerSummary = {
      playerId,
      name: playerId,
      isHost: false,
      status: 'active',
      buyInCents: 0,
      cashOutCents: 0,
      priorPaymentCents: 0,
      priorReceivedCents: 0,
      netCents: 0,
      entryCount: 0,
      hasActivity: false,
      hasFinalCashout: false,
      finalCashoutCents: null,
      lastEntryAt: null,
    };
    summaryByPlayer.set(playerId, fallback);
    return fallback;
  };

  for (const entry of rows) {
    const summary = ensure(entry.playerId);
    summary.entryCount += 1;
    summary.hasActivity = true;
    summary.lastEntryAt = Math.max(summary.lastEntryAt ?? 0, entry.createdAt);
    if (entry.entryType === 'buy_in') {
      summary.buyInCents += entry.amountCents;
    } else if (entry.entryType === 'cash_out') {
      summary.cashOutCents += entry.amountCents;
      if (entry.isFinal) {
        summary.hasFinalCashout = true;
        summary.finalCashoutCents = entry.amountCents;
      }
    } else {
      summary.priorPaymentCents += entry.amountCents;
      if (entry.toPlayerId) {
        const recipient = ensure(entry.toPlayerId);
        recipient.priorReceivedCents += entry.amountCents;
        recipient.hasActivity = true;
        recipient.lastEntryAt = Math.max(recipient.lastEntryAt ?? 0, entry.createdAt);
      }
    }
  }

  for (const summary of summaryByPlayer.values()) {
    summary.netCents = summary.cashOutCents - summary.buyInCents;
  }

  return Array.from(summaryByPlayer.values()).sort(
    (a, b) =>
      (players.find((p) => p.playerId === a.playerId)?.sortOrder ?? 9999) -
        (players.find((p) => p.playerId === b.playerId)?.sortOrder ?? 9999) ||
      a.name.localeCompare(b.name) ||
      a.playerId.localeCompare(b.playerId)
  );
}

export function deriveLiveBankSummary(
  input: LiveGameSnapshot | LiveGame,
  entriesArg?: ReadonlyArray<LiveEntry>,
  checkpointsArg?: ReadonlyArray<LiveChipCheckpoint>
): LiveBankSummary {
  const game = 'game' in input ? input.game : input;
  const entries = 'game' in input ? input.entries : (entriesArg ?? []);
  const checkpoints = 'game' in input ? input.chipCheckpoints : (checkpointsArg ?? []);

  const rows = activeEntries(entries);
  const chipsInPlayCents = rows.reduce((acc, entry) => {
    if (entry.entryType === 'buy_in') return acc + entry.amountCents;
    if (entry.entryType === 'cash_out') return acc - entry.amountCents;
    return acc;
  }, 0);
  const expectedBankOnHandCents =
    game.totalChipBankCents === null ? null : game.totalChipBankCents - chipsInPlayCents;

  const latestTable = checkpoints
    .filter((c) => c.checkpointType === 'verify_table_count')
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  const latestBank = checkpoints
    .filter((c) => c.checkpointType === 'verify_bank_count')
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)[0];

  return {
    totalChipBankCents: game.totalChipBankCents,
    chipsInPlayCents,
    expectedBankOnHandCents,
    latestTableCountCents: latestTable?.amountCents ?? null,
    latestTableExpectedCents: latestTable?.expectedCents ?? (latestTable ? chipsInPlayCents : null),
    latestTableDeltaCents:
      latestTable?.deltaCents ?? (latestTable ? latestTable.amountCents - chipsInPlayCents : null),
    latestBankCountCents: latestBank?.amountCents ?? null,
    latestBankExpectedCents:
      latestBank?.expectedCents ?? (latestBank ? expectedBankOnHandCents : null),
    latestBankDeltaCents:
      latestBank?.deltaCents ??
      (latestBank && expectedBankOnHandCents !== null
        ? latestBank.amountCents - expectedBankOnHandCents
        : null),
  };
}

export function deriveFinalLedgerRows(snapshot: LiveGameSnapshot): LedgerRow[] {
  const summaries = deriveLivePlayerSummaries(snapshot);
  const playersById = new Map(snapshot.players.map((p) => [p.playerId, p]));
  const adjustmentIds = new Set<string>();
  for (const entry of activeEntries(snapshot.entries)) {
    if (entry.entryType !== 'prior_payment') continue;
    adjustmentIds.add(entry.playerId);
    if (entry.toPlayerId) adjustmentIds.add(entry.toPlayerId);
  }

  return summaries
    .filter((summary) => {
      if (summary.buyInCents > 0 || summary.cashOutCents > 0) return true;
      if (adjustmentIds.has(summary.playerId)) return true;
      return snapshot.game.hostPlayerId === summary.playerId;
    })
    .map((summary) => {
      const player = playersById.get(summary.playerId);
      return {
        playerId: summary.playerId,
        nickname: player?.name ?? summary.name,
        buyInCents: summary.buyInCents,
        buyOutCents: summary.cashOutCents,
        netCents: summary.netCents,
      };
    });
}

export function balanceFinalLedgerRows(rows: ReadonlyArray<LedgerRow>): {
  rows: LedgerRow[];
  proportionalAdjustments: LiveProportionalAdjustment[];
} {
  const out = rows.map((row) => ({ ...row }));
  const sumCents = out.reduce((acc, row) => acc + row.netCents, 0);
  if (sumCents === 0 || out.length === 0) {
    return { rows: out, proportionalAdjustments: [] };
  }

  const targetAdjustmentCents = -sumCents;
  const candidates = adjustmentCandidates(out);
  if (candidates.length === 0) {
    return { rows: out, proportionalAdjustments: [] };
  }

  const totalBasis = candidates.reduce((acc, candidate) => acc + candidate.basisCents, 0);
  if (totalBasis <= 0) {
    return { rows: out, proportionalAdjustments: [] };
  }

  const sign = targetAdjustmentCents < 0 ? -1 : 1;
  const totalAbs = Math.abs(targetAdjustmentCents);
  const shares = candidates.map((candidate) => {
    const raw = totalAbs * candidate.basisCents;
    return {
      ...candidate,
      amountAbs: Math.floor(raw / totalBasis),
      remainder: raw % totalBasis,
    };
  });

  const assignedAbs = shares.reduce((acc, share) => acc + share.amountAbs, 0);
  const remainderCount = totalAbs - assignedAbs;
  const byRemainder = shares
    .slice()
    .sort(
      (a, b) =>
        b.remainder - a.remainder || out[a.index]!.playerId.localeCompare(out[b.index]!.playerId)
    );
  for (let i = 0; i < remainderCount; i++) {
    byRemainder[i % byRemainder.length]!.amountAbs += 1;
  }

  const proportionalAdjustments: LiveProportionalAdjustment[] = [];
  for (const share of shares) {
    if (share.amountAbs === 0) continue;
    const amountCents = sign * share.amountAbs;
    const row = out[share.index]!;
    row.netCents += amountCents;
    proportionalAdjustments.push({
      playerId: row.playerId,
      amountCents,
      basisCents: share.basisCents,
    });
  }

  return { rows: out, proportionalAdjustments };
}

export function derivePriorPaymentAdjustments(snapshot: LiveGameSnapshot): Adjustment[] {
  return activeEntries(snapshot.entries)
    .filter((entry) => entry.entryType === 'prior_payment' && entry.toPlayerId)
    .map((entry) => ({
      id: entry.id,
      fromId: entry.playerId,
      toId: entry.toPlayerId!,
      amountCents: entry.amountCents,
    }));
}

export function validateLiveFinalization(
  snapshot: LiveGameSnapshot,
  options: { pendingCount?: number; force?: boolean } = {}
): LiveFinalizationValidation {
  const pendingCount = options.pendingCount ?? 0;
  const force = options.force === true;
  const rawRows = deriveFinalLedgerRows(snapshot);
  const { rows, proportionalAdjustments } = balanceFinalLedgerRows(rawRows);
  const adjustments = derivePriorPaymentAdjustments(snapshot);
  const summaries = deriveLivePlayerSummaries(snapshot);
  const rowIds = new Set(rows.map((row) => row.playerId));
  const playerIds = new Set(snapshot.players.map((p) => p.playerId));
  const bank = deriveLiveBankSummary(snapshot);
  const hasFinancialActivity = activeEntries(snapshot.entries).length > 0;

  const checks: LiveFinalizationCheck[] = [];
  const addCheck = (
    key: string,
    label: string,
    ok: boolean,
    blocking: boolean,
    detail: string | null = null
  ) => {
    checks.push({ key, label, ok, blocking, detail });
  };

  addCheck(
    'active',
    'live game is active',
    snapshot.game.status === 'active',
    true,
    snapshot.game.status === 'active' ? null : `Current status: ${snapshot.game.status}.`
  );
  addCheck(
    'outbox',
    'no pending local events',
    pendingCount === 0,
    true,
    pendingCount === 0 ? null : `${pendingCount} unsynced event(s).`
  );
  addCheck(
    'activity',
    'at least one player has activity',
    hasFinancialActivity,
    true,
    hasFinancialActivity ? null : 'Add a buy-in, cashout, or prior payment first.'
  );

  const missingFinals = summaries.filter(
    (summary) => summary.buyInCents > 0 && !summary.hasFinalCashout
  );
  addCheck(
    'final_cashouts',
    'every buy-in has a final cashout',
    missingFinals.length === 0,
    true,
    missingFinals.length === 0 ? null : missingFinals.map((s) => s.name).join(', ')
  );

  const rawLedgerCheck = ledgerBalances(rawRows);
  const ledgerCheck = ledgerBalances(rows);
  const hasProportionalAdjustments = proportionalAdjustments.length > 0;
  addCheck(
    'balanced',
    hasProportionalAdjustments
      ? 'cashouts balanced with proportional adjustments'
      : 'buy-ins equal cashouts',
    Math.abs(ledgerCheck.sumCents) <= BALANCE_TOLERANCE_CENTS,
    true,
    Math.abs(ledgerCheck.sumCents) > BALANCE_TOLERANCE_CENTS
      ? `Ledger is off by ${formatNet(rawLedgerCheck.sumCents)}.`
      : hasProportionalAdjustments
        ? `Raw ledger was off by ${formatNet(rawLedgerCheck.sumCents)}.`
        : null
  );

  if (hasProportionalAdjustments) {
    const nameById = new Map(rows.map((row) => [row.playerId, row.nickname]));
    addCheck(
      'proportional_adjustments',
      'cashout difference is allocated proportionally',
      true,
      false,
      proportionalAdjustments
        .map(
          (adj) =>
            `${nameById.get(adj.playerId) ?? adj.playerId}: ${formatDollars(adj.amountCents, {
              signed: true,
            })}`
        )
        .join(', ')
    );
  }

  const tableDelta = bank.latestTableDeltaCents ?? 0;
  const bankDelta = bank.latestBankDeltaCents ?? 0;
  const bankIsBalanced = tableDelta === 0 && bankDelta === 0;
  addCheck(
    'chip_bank',
    'latest chip count is balanced',
    bankIsBalanced || force,
    !force,
    bankIsBalanced ? null : chipBankDetail(bank.latestTableDeltaCents, bank.latestBankDeltaCents)
  );

  const missingAdjustmentTargets = adjustments.filter(
    (adj) =>
      !playerIds.has(adj.fromId) ||
      !playerIds.has(adj.toId) ||
      !rowIds.has(adj.fromId) ||
      !rowIds.has(adj.toId)
  );
  addCheck(
    'prior_payment_targets',
    'prior payment targets are in the final ledger',
    missingAdjustmentTargets.length === 0,
    true,
    missingAdjustmentTargets.length === 0
      ? null
      : 'One or more prior payments references a player outside the final ledger.'
  );

  const duplicateFinals = summaries.filter((summary) => {
    const finalCount = activeEntries(snapshot.entries).filter(
      (entry) =>
        entry.playerId === summary.playerId && entry.entryType === 'cash_out' && entry.isFinal
    ).length;
    return finalCount > 1;
  });
  addCheck(
    'one_final_cashout',
    'one final cashout per player',
    duplicateFinals.length === 0,
    true,
    duplicateFinals.length === 0 ? null : duplicateFinals.map((s) => s.name).join(', ')
  );

  const errors = checks
    .filter((check) => check.blocking && !check.ok)
    .map((check) => (check.detail ? `${check.label}: ${check.detail}` : check.label));
  const warnings = checks
    .filter((check) => !check.blocking && !check.ok)
    .map((check) => (check.detail ? `${check.label}: ${check.detail}` : check.label));

  return {
    ok: errors.length === 0,
    checks,
    errors,
    warnings,
    rawRows,
    rows,
    adjustments,
    proportionalAdjustments,
  };
}

function adjustmentCandidates(
  rows: ReadonlyArray<LedgerRow>
): Array<{ index: number; basisCents: number }> {
  return rows
    .map((row, index) => ({ index, basisCents: row.buyOutCents }))
    .filter((candidate) => candidate.basisCents > 0);
}

function chipBankDetail(tableDelta: number | null, bankDelta: number | null): string | null {
  const parts: string[] = [];
  if (tableDelta !== null && tableDelta !== 0) {
    parts.push(`table count off by ${formatDollars(tableDelta, { signed: true })}`);
  }
  if (bankDelta !== null && bankDelta !== 0) {
    parts.push(`bank count off by ${formatDollars(bankDelta, { signed: true })}`);
  }
  return parts.length > 0 ? parts.join('; ') : null;
}
