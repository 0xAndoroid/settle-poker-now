import { describe, expect, it } from 'vitest';
import { decodeHash, encodeHash, type HashState } from './hashState';

describe('hashState', () => {
  it('round-trips a populated state', () => {
    const state: HashState = {
      gameId: 'abc123',
      adjustments: [
        { id: 'a1', fromId: 'andrew', toId: 'kevin', amountCents: 40000 },
      ],
      groups: [{ id: 'g1', memberIds: ['andrew', 'kevin', 'kedar'] }],
    };
    const encoded = encodeHash(state);
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');
    const decoded = decodeHash(encoded);
    expect(decoded).toEqual(state);
  });

  it('produces an empty string for empty state', () => {
    expect(encodeHash({ gameId: null, adjustments: [], groups: [] })).toBe('');
  });

  it('returns empty state for invalid hash', () => {
    const decoded = decodeHash('not-base64-not-json');
    expect(decoded.gameId).toBeNull();
    expect(decoded.adjustments).toEqual([]);
    expect(decoded.groups).toEqual([]);
  });

  it('handles unicode in nicknames safely', () => {
    const state: HashState = {
      gameId: 'g',
      adjustments: [{ id: 'unicode-id-✨', fromId: 'a-é', toId: 'b-π', amountCents: 100 }],
      groups: [],
    };
    const decoded = decodeHash(encodeHash(state));
    expect(decoded).toEqual(state);
  });
});
