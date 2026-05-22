import { describe, expect, it } from 'vitest';
import type { Adjustment, LedgerRow } from '../../src/lib/types';
import { CreateFinalizedValidationError } from './db';
import { validateLiveIsolationRules } from './live-db';

const rows: LedgerRow[] = [
  {
    playerId: 'alice',
    nickname: 'Alice',
    netCents: -10_000,
    buyInCents: 10_000,
    buyOutCents: 0,
  },
  {
    playerId: 'bob',
    nickname: 'Bob',
    netCents: 7_000,
    buyInCents: 10_000,
    buyOutCents: 17_000,
  },
  {
    playerId: 'cyd',
    nickname: 'Cyd',
    netCents: 3_000,
    buyInCents: 10_000,
    buyOutCents: 13_000,
  },
];

const adjustments: Adjustment[] = [];

describe('validateLiveIsolationRules', () => {
  it('accepts live isolation rules and keeps only the latest rule per player', () => {
    expect(
      validateLiveIsolationRules(rows, adjustments, [
        { playerId: 'alice', counterpartId: 'bob' },
        { playerId: 'alice', counterpartId: 'cyd' },
      ])
    ).toEqual([{ playerId: 'alice', counterpartId: 'cyd' }]);
  });

  it('rejects rules that reference players outside the final live ledger', () => {
    expect(() =>
      validateLiveIsolationRules(rows, adjustments, [{ playerId: 'alice', counterpartId: 'ghost' }])
    ).toThrow(CreateFinalizedValidationError);
  });

  it('rejects isolation cycles before finalizing a live game', () => {
    expect(() =>
      validateLiveIsolationRules(rows, adjustments, [
        { playerId: 'alice', counterpartId: 'bob' },
        { playerId: 'bob', counterpartId: 'alice' },
      ])
    ).toThrow(/cycle/i);
  });
});
