import { describe, expect, it } from 'vitest';
import { LedgerParseError, ledgerBalances, parseLedgerCsv } from './csv';

const SAMPLE = [
  'player_nickname,player_id,session_start_at,session_end_at,buy_in,buy_out,stack,net',
  'Andrew,andrew_id,2026-04-27T20:00:00Z,2026-04-27T23:00:00Z,50000,0,0,-50000',
  'Kevin,kevin_id,2026-04-27T20:00:00Z,2026-04-27T23:00:00Z,30000,70000,0,40000',
  'Kedar,kedar_id,2026-04-27T20:30:00Z,2026-04-27T23:00:00Z,40000,10000,0,-30000',
  'Pranav,pranav_id,2026-04-27T20:00:00Z,2026-04-27T23:00:00Z,30000,70000,0,40000',
].join('\n');

describe('parseLedgerCsv', () => {
  it('aggregates a balanced 4-player game', () => {
    const ledger = parseLedgerCsv(SAMPLE);
    expect(ledger.rows).toHaveLength(4);
    const balances = ledgerBalances(ledger.rows);
    expect(balances.isBalanced).toBe(true);
    expect(balances.sumCents).toBe(0);
  });

  it('returns rows sorted by net descending, with deterministic tiebreak', () => {
    const ledger = parseLedgerCsv(SAMPLE);
    expect(ledger.rows.map((r) => r.playerId)).toEqual([
      'kevin_id',
      'pranav_id',
      'kedar_id',
      'andrew_id',
    ]);
  });

  it('aggregates by player_id when a player has multiple session rows', () => {
    const csv = [
      'player_nickname,player_id,session_start_at,session_end_at,buy_in,buy_out,stack,net',
      // Two segments for the same player_id.
      'Old Name,p1,2026-04-27T20:00:00Z,2026-04-27T21:00:00Z,10000,0,0,-10000',
      'New Name,p1,2026-04-27T22:00:00Z,2026-04-27T23:00:00Z,5000,15000,0,10000',
      'Other,p2,2026-04-27T20:00:00Z,2026-04-27T23:00:00Z,5000,5000,0,0',
    ].join('\n');
    const ledger = parseLedgerCsv(csv);
    const p1 = ledger.rows.find((r) => r.playerId === 'p1')!;
    expect(p1.netCents).toBe(0); // -100 + 100 = 0
    // Display name = nickname from latest session_start_at row.
    expect(p1.nickname).toBe('New Name');
  });

  it('throws LedgerParseError on missing required columns', () => {
    const csv = 'player_nickname,buy_in\nA,1';
    expect(() => parseLedgerCsv(csv)).toThrow(LedgerParseError);
  });

  it('throws on empty input', () => {
    expect(() => parseLedgerCsv('')).toThrow(LedgerParseError);
  });

  it('captures earliest start and latest end across all rows', () => {
    const ledger = parseLedgerCsv(SAMPLE);
    expect(ledger.startedAt?.toISOString()).toBe('2026-04-27T20:00:00.000Z');
    expect(ledger.endedAt?.toISOString()).toBe('2026-04-27T23:00:00.000Z');
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
