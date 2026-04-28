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
      encodeHash({ gameId: null, adjustments: [], isolations: [], unitOverride: null })
    ).toBe('');
  });

  it('non-empty when only unitOverride is set', () => {
    const state: HashState = {
      gameId: null,
      adjustments: [],
      isolations: [],
      unitOverride: 'cents',
    };
    expect(encodeHash(state)).not.toBe('');
    expect(decodeHash(encodeHash(state)).unitOverride).toBe('cents');
  });

  it('returns empty state for invalid hash', () => {
    const decoded = decodeHash('not-base64-not-json');
    expect(decoded.gameId).toBeNull();
    expect(decoded.adjustments).toEqual([]);
    expect(decoded.isolations).toEqual([]);
    expect(decoded.unitOverride).toBeNull();
  });

  it('handles unicode in nicknames safely', () => {
    const state: HashState = {
      gameId: 'g',
      adjustments: [{ id: 'unicode-id-✨', fromId: 'a-é', toId: 'b-π', amountCents: 100 }],
      isolations: [],
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
      // Cast through unknown to inject an invalid value.
      unitOverride: 'pesos' as unknown as HashState['unitOverride'],
    };
    expect(decodeHash(encodeHash(bogus)).unitOverride).toBeNull();
  });
});
