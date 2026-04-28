/**
 * Validation tests for `createGameFinalized`.
 *
 * The success path requires a real D1; we exercise it via the worker's
 * smoke tests post-deploy. These unit tests cover only the validation
 * paths — they all throw before any D1 call runs, so we feed in a stub
 * `db` whose methods are never reached.
 */

import { describe, expect, it } from 'vitest';
import {
  CreateFinalizedValidationError,
  createGameFinalized,
} from './db';

const stubDb = {} as unknown as D1Database;

const baseRows = [
  {
    playerId: 'a',
    nickname: 'Andrew',
    netCents: -5000,
    buyInCents: 0,
    buyOutCents: 0,
  },
  {
    playerId: 'k',
    nickname: 'Kevin',
    netCents: 5000,
    buyInCents: 0,
    buyOutCents: 0,
  },
];

const baseInput = () => ({
  pokernowGameId: 'pokernow-test',
  sourceUnit: 'cents' as const,
  unitProvenance: 'header' as const,
  startedAt: 0,
  endedAt: 0,
  rows: baseRows,
  adjustments: [],
  isolations: [],
  aliases: [],
  actorLabel: 'Andrew',
});

describe('createGameFinalized — validation', () => {
  it('rejects an adjustment that references an unknown player', async () => {
    await expect(
      createGameFinalized(stubDb, {
        ...baseInput(),
        adjustments: [{ fromPlayerId: 'a', toPlayerId: 'ghost', amountCents: 100 }],
      })
    ).rejects.toBeInstanceOf(CreateFinalizedValidationError);
  });

  it('rejects an adjustment whose from === to', async () => {
    await expect(
      createGameFinalized(stubDb, {
        ...baseInput(),
        adjustments: [{ fromPlayerId: 'a', toPlayerId: 'a', amountCents: 100 }],
      })
    ).rejects.toThrowError(/from and to must differ/i);
  });

  it('rejects a non-positive adjustment amount', async () => {
    await expect(
      createGameFinalized(stubDb, {
        ...baseInput(),
        adjustments: [{ fromPlayerId: 'a', toPlayerId: 'k', amountCents: 0 }],
      })
    ).rejects.toThrowError(/positive/i);
    await expect(
      createGameFinalized(stubDb, {
        ...baseInput(),
        adjustments: [{ fromPlayerId: 'a', toPlayerId: 'k', amountCents: -100 }],
      })
    ).rejects.toThrowError(/positive/i);
  });

  it('rejects a self-isolation rule', async () => {
    await expect(
      createGameFinalized(stubDb, {
        ...baseInput(),
        isolations: [{ playerId: 'a', counterpartId: 'a' }],
      })
    ).rejects.toThrowError(/themselves/i);
  });

  it('rejects an isolation rule pointing at an unknown player', async () => {
    await expect(
      createGameFinalized(stubDb, {
        ...baseInput(),
        isolations: [{ playerId: 'a', counterpartId: 'ghost' }],
      })
    ).rejects.toBeInstanceOf(CreateFinalizedValidationError);
  });

  it('rejects a self-alias', async () => {
    await expect(
      createGameFinalized(stubDb, {
        ...baseInput(),
        aliases: [{ playerId: 'a', aliasToPlayerId: 'a' }],
      })
    ).rejects.toThrowError(/themselves/i);
  });

  it('rejects alias rules forming a 2-cycle', async () => {
    await expect(
      createGameFinalized(stubDb, {
        ...baseInput(),
        aliases: [
          { playerId: 'a', aliasToPlayerId: 'k' },
          { playerId: 'k', aliasToPlayerId: 'a' },
        ],
      })
    ).rejects.toThrowError(/cycle/i);
  });

  it('rejects an alias whose target collapses back to the source', async () => {
    // Three players: a → b → c, then c → a — that's a cycle of length 3.
    const input = baseInput();
    input.rows = [
      ...baseRows,
      { playerId: 'c', nickname: 'Cody', netCents: 0, buyInCents: 0, buyOutCents: 0 },
    ];
    input.aliases = [
      { playerId: 'a', aliasToPlayerId: 'k' },
      { playerId: 'k', aliasToPlayerId: 'c' },
      { playerId: 'c', aliasToPlayerId: 'a' },
    ];
    await expect(createGameFinalized(stubDb, input)).rejects.toThrowError(
      /cycle/i
    );
  });

  it('rejects an alias whose source is not a known player', async () => {
    await expect(
      createGameFinalized(stubDb, {
        ...baseInput(),
        aliases: [{ playerId: 'ghost', aliasToPlayerId: 'a' }],
      })
    ).rejects.toBeInstanceOf(CreateFinalizedValidationError);
  });

  it('accepts a note alongside the bundle (validation path)', async () => {
    // The note is non-validating — the function passes it through to D1
    // after the validation block. Ensure adding a note doesn't trigger
    // any spurious validation. We still expect the call to fail at the
    // first D1 access, but NOT with a CreateFinalizedValidationError.
    const input = {
      ...baseInput(),
      note: 'poker game 4/27',
    };
    await expect(createGameFinalized(stubDb, input)).rejects.not.toBeInstanceOf(
      CreateFinalizedValidationError
    );
  });
});
