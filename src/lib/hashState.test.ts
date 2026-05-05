import { describe, expect, it } from 'vitest';
import { decodeHash, encodeHash, type HashState } from './hashState';

describe('hashState', () => {
  it('round-trips a populated state', () => {
    const state: HashState = {
      gameId: 'abc123',
      adjustments: [
        { id: 'a1', fromId: 'andrew', toId: 'kevin', amountCents: 40000 },
      ],
      isolations: [
        { playerId: 'andrew', counterpartId: 'kevin' },
        { playerId: 'sam', counterpartId: 'kevin' },
      ],
      aliases: [
        { playerId: 'andrew2', aliasToPlayerId: 'andrew' },
      ],
      paymentPreferences: [
        { playerId: 'andrew', rail: 'venmo' },
        { playerId: 'kevin', rail: 'zelle' },
      ],
      unitOverride: 'dollars',
    };
    const encoded = encodeHash(state);
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');
    expect(decodeHash(encoded)).toEqual(state);
  });

  it('produces an empty string for empty state', () => {
    expect(
      encodeHash({
        gameId: null,
        adjustments: [],
        isolations: [],
        aliases: [],
        paymentPreferences: [],
        unitOverride: null,
      })
    ).toBe('');
  });

  it('non-empty when only unitOverride is set', () => {
    const state: HashState = {
      gameId: null,
      adjustments: [],
      isolations: [],
      aliases: [],
      paymentPreferences: [],
      unitOverride: 'cents',
    };
    expect(encodeHash(state)).not.toBe('');
    expect(decodeHash(encodeHash(state)).unitOverride).toBe('cents');
  });

  it('non-empty when only aliases are set', () => {
    const state: HashState = {
      gameId: null,
      adjustments: [],
      isolations: [],
      aliases: [{ playerId: 'a', aliasToPlayerId: 'b' }],
      paymentPreferences: [],
      unitOverride: null,
    };
    expect(encodeHash(state)).not.toBe('');
    expect(decodeHash(encodeHash(state)).aliases).toEqual([
      { playerId: 'a', aliasToPlayerId: 'b' },
    ]);
  });

  it('returns empty state for invalid hash', () => {
    const decoded = decodeHash('not-base64-not-json');
    expect(decoded.gameId).toBeNull();
    expect(decoded.adjustments).toEqual([]);
    expect(decoded.isolations).toEqual([]);
    expect(decoded.aliases).toEqual([]);
    expect(decoded.paymentPreferences).toEqual([]);
    expect(decoded.unitOverride).toBeNull();
  });

  it('non-empty when only payment preferences are set', () => {
    const state: HashState = {
      gameId: null,
      adjustments: [],
      isolations: [],
      aliases: [],
      paymentPreferences: [{ playerId: 'a', rail: 'venmo' }],
      unitOverride: null,
    };
    expect(encodeHash(state)).not.toBe('');
    expect(decodeHash(encodeHash(state)).paymentPreferences).toEqual([
      { playerId: 'a', rail: 'venmo' },
    ]);
  });

  it('strips invalid alias rows (self-alias) on decode', () => {
    // Forge a hash with an alias whose source = target. Encode normally
    // through the public API, then assert decode rejects it. We
    // reproduce the legacy payload shape directly to verify the filter.
    const fakeState: HashState = {
      gameId: 'g',
      adjustments: [],
      isolations: [],
      aliases: [
        { playerId: 'andrew', aliasToPlayerId: 'andrew' },
        { playerId: 'kev', aliasToPlayerId: 'kevin' },
      ],
      paymentPreferences: [],
      unitOverride: null,
    };
    const decoded = decodeHash(encodeHash(fakeState));
    // The self-alias is dropped; the legitimate one survives.
    expect(decoded.aliases).toEqual([
      { playerId: 'kev', aliasToPlayerId: 'kevin' },
    ]);
  });

  it('handles unicode in nicknames safely', () => {
    const state: HashState = {
      gameId: 'g',
      adjustments: [{ id: 'unicode-id-✨', fromId: 'a-é', toId: 'b-π', amountCents: 100 }],
      isolations: [],
      aliases: [],
      paymentPreferences: [],
      unitOverride: null,
    };
    expect(decodeHash(encodeHash(state))).toEqual(state);
  });

  it('rejects invalid unit override values', () => {
    // Construct a hash with a bogus unit string and verify it normalizes to null.
    const bogus: HashState = {
      gameId: 'x',
      adjustments: [],
      isolations: [],
      aliases: [],
      paymentPreferences: [],
      // Cast through unknown to inject an invalid value.
      unitOverride: 'pesos' as unknown as HashState['unitOverride'],
    };
    expect(decodeHash(encodeHash(bogus)).unitOverride).toBeNull();
  });
});
