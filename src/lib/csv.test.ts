import { describe, expect, it } from 'vitest';
import { LedgerParseError, inferUnit, ledgerBalances, parseLedgerCsv } from './csv';

const CENTS_SAMPLE = [
  'player_nickname,player_id,session_start_at,session_end_at,buy_in,buy_out,stack,net',
  'Andrew,andrew_id,2026-04-27T20:00:00Z,2026-04-27T23:00:00Z,50000,0,0,-50000',
  'Kevin,kevin_id,2026-04-27T20:00:00Z,2026-04-27T23:00:00Z,30000,70000,0,40000',
  'Kedar,kedar_id,2026-04-27T20:30:00Z,2026-04-27T23:00:00Z,40000,10000,0,-30000',
  'Pranav,pranav_id,2026-04-27T20:00:00Z,2026-04-27T23:00:00Z,30000,70000,0,40000',
].join('\n');

// Live PokerNow dollars-mode game (real fixture, sum-to-zero).
const DOLLARS_SAMPLE = [
  'player_nickname,player_id,session_start_at,session_end_at,buy_in,buy_out,stack,net',
  'aryan,7laCmNIu1Q,2026-04-28T02:29:11.734Z,2026-04-28T02:44:29.774Z,200,0,0,-200',
  'KEDAR,wniWV9SZCA,2026-04-28T02:26:25.976Z,,200,,226,26',
  'om,SEqtk4oefp,2026-04-28T02:25:26.759Z,2026-04-28T02:58:01.254Z,500,628,0,128',
  'Andrew,wBcyK_YnY6,2026-04-28T01:52:31.222Z,,200,,471,271',
  'steve,49yM2VKswl,2026-04-28T01:44:55.678Z,,200,,364,164',
  'Andrew,wBcyK_YnY6,2026-04-28T01:44:12.811Z,2026-04-28T01:51:48.441Z,100,0,0,-100',
  'kev,lWyn_wrdD6,2026-04-28T01:42:08.698Z,,100,,61,-39',
  'aryan,7laCmNIu1Q,2026-04-28T01:31:28.700Z,2026-04-28T02:28:44.434Z,200,0,0,-200',
  'Skyler,7EBKNs_Kdi,2026-04-28T01:17:39.819Z,,100,,201,101',
  'Pucci,nYq-4kxEIr,2026-04-28T01:17:39.829Z,2026-04-28T02:53:31.784Z,100,399,0,299',
  'Shay,aY546rRUzm,2026-04-28T01:17:39.824Z,2026-04-28T02:53:31.779Z,250,0,0,-250',
  'Skyler,Thim9eAUHg,,2026-04-28T01:13:45.117Z,100,100,0,0',
  'KEDAR,wniWV9SZCA,2026-04-28T01:17:39.815Z,2026-04-28T02:25:26.754Z,100,0,0,-100',
  'steve,49yM2VKswl,2026-04-28T01:17:39.806Z,2026-04-28T01:44:12.805Z,100,0,0,-100',
].join('\n');

describe('parseLedgerCsv — cents mode', () => {
  it('aggregates a balanced 4-player game', () => {
    const ledger = parseLedgerCsv(CENTS_SAMPLE);
    expect(ledger.rows).toHaveLength(4);
    const balances = ledgerBalances(ledger.rows);
    expect(balances.isBalanced).toBe(true);
    expect(balances.sumCents).toBe(0);
    expect(ledger.unit).toBe('cents');
    expect(ledger.unitWasInferred).toBe(true);
  });

  it('returns rows sorted by net descending, deterministic tiebreak', () => {
    const ledger = parseLedgerCsv(CENTS_SAMPLE);
    expect(ledger.rows.map((r) => r.playerId)).toEqual([
      'kevin_id',
      'pranav_id',
      'kedar_id',
      'andrew_id',
    ]);
  });

  it('aggregates by player_id across multiple session rows', () => {
    const csv = [
      'player_nickname,player_id,session_start_at,session_end_at,buy_in,buy_out,stack,net',
      'Old Name,p1,2026-04-27T20:00:00Z,2026-04-27T21:00:00Z,10000,0,0,-10000',
      'New Name,p1,2026-04-27T22:00:00Z,2026-04-27T23:00:00Z,5000,15000,0,10000',
      'Other,p2,2026-04-27T20:00:00Z,2026-04-27T23:00:00Z,5000,5000,0,0',
    ].join('\n');
    const ledger = parseLedgerCsv(csv);
    const p1 = ledger.rows.find((r) => r.playerId === 'p1')!;
    expect(p1.netCents).toBe(0);
    expect(p1.nickname).toBe('New Name');
  });

  it('captures earliest start and latest end across all rows', () => {
    const ledger = parseLedgerCsv(CENTS_SAMPLE);
    expect(ledger.startedAt?.toISOString()).toBe('2026-04-27T20:00:00.000Z');
    expect(ledger.endedAt?.toISOString()).toBe('2026-04-27T23:00:00.000Z');
  });
});

describe('parseLedgerCsv — dollars mode (cents disabled in PokerNow)', () => {
  it('infers dollars-mode and multiplies values by 100', () => {
    const ledger = parseLedgerCsv(DOLLARS_SAMPLE);
    expect(ledger.unit).toBe('dollars');
    expect(ledger.unitWasInferred).toBe(true);

    // Pucci won $299 in dollars-mode → 29_900 cents internally.
    const pucci = ledger.rows.find((r) => r.playerId === 'nYq-4kxEIr');
    expect(pucci?.netCents).toBe(29900);

    // aryan lost $400 (across two segments −200 + −200).
    const aryan = ledger.rows.find((r) => r.playerId === '7laCmNIu1Q');
    expect(aryan?.netCents).toBe(-40000);

    // Shay lost $250.
    const shay = ledger.rows.find((r) => r.playerId === 'aY546rRUzm');
    expect(shay?.netCents).toBe(-25000);

    // Sum-to-zero invariant holds at the cents level.
    expect(ledgerBalances(ledger.rows).sumCents).toBe(0);
  });

  it('respects an explicit cents override even when heuristic would say dollars', () => {
    const ledger = parseLedgerCsv(DOLLARS_SAMPLE, { unit: 'cents' });
    expect(ledger.unit).toBe('cents');
    expect(ledger.unitWasInferred).toBe(false);

    // Pucci's raw +299 becomes $2.99 in cents-mode, so netCents stays 299.
    const pucci = ledger.rows.find((r) => r.playerId === 'nYq-4kxEIr');
    expect(pucci?.netCents).toBe(299);
  });

  it('respects an explicit dollars override even when heuristic would say cents', () => {
    const ledger = parseLedgerCsv(CENTS_SAMPLE, { unit: 'dollars' });
    expect(ledger.unit).toBe('dollars');
    expect(ledger.unitWasInferred).toBe(false);

    // Kevin's +40000 raw → +$40000 → 4_000_000 cents internally.
    const kevin = ledger.rows.find((r) => r.playerId === 'kevin_id');
    expect(kevin?.netCents).toBe(4_000_000);
  });
});

describe('inferUnit', () => {
  it('returns cents when any value reaches the threshold', () => {
    expect(inferUnit([100, 200, 5000, -3000])).toBe('cents');
    // Threshold is inclusive at 2000.
    expect(inferUnit([2000, 0, 0])).toBe('cents');
  });

  it('returns dollars when all magnitudes are sub-threshold', () => {
    expect(inferUnit([100, 200, -150, 1999, -1999])).toBe('dollars');
  });

  it('defaults to dollars on an all-zero ledger (lowest-cost mistake)', () => {
    expect(inferUnit([0, 0, 0])).toBe('dollars');
  });

  it('uses absolute magnitudes', () => {
    expect(inferUnit([-2500])).toBe('cents');
  });
});

describe('parseLedgerCsv — error handling', () => {
  it('throws LedgerParseError on missing required columns', () => {
    expect(() => parseLedgerCsv('player_nickname,buy_in\nA,1')).toThrow(LedgerParseError);
  });

  it('throws on empty input', () => {
    expect(() => parseLedgerCsv('')).toThrow(LedgerParseError);
  });
});

describe('ledgerBalances', () => {
  it('detects an unbalanced ledger', () => {
    const result = ledgerBalances([
      { playerId: 'a', nickname: 'A', netCents: -10000, buyInCents: 0, buyOutCents: 0 },
      { playerId: 'b', nickname: 'B', netCents: 5000, buyInCents: 0, buyOutCents: 0 },
    ]);
    expect(result.isBalanced).toBe(false);
    expect(result.sumCents).toBe(-5000);
  });
});
