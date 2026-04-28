import { describe, expect, it } from 'vitest';
import { extractGameId, ledgerProxyUrl } from './pokernow';

describe('extractGameId', () => {
  it.each([
    ['https://www.pokernow.club/games/abc123', 'abc123'],
    ['https://pokernow.com/games/abc123/', 'abc123'],
    ['http://www.pokernow.com/games/abc123?spectator=1', 'abc123'],
    ['pokernow.club/games/xy_z-9', 'xy_z-9'],
    ['  https://www.pokernow.club/games/abc123  ', 'abc123'],
  ])('extracts game id from %s', (url, expected) => {
    expect(extractGameId(url)).toBe(expected);
  });

  it('accepts a bare game id', () => {
    expect(extractGameId('abc-123_XY')).toBe('abc-123_XY');
  });

  it('rejects non-PokerNow URLs', () => {
    expect(extractGameId('https://example.com/games/abc')).toBeNull();
    expect(extractGameId('https://www.pokernow.club/about')).toBeNull();
    expect(extractGameId('')).toBeNull();
    expect(extractGameId('not a url at all!')).toBeNull();
  });
});

describe('ledgerProxyUrl', () => {
  it('builds a /api/ledger URL with the game id query', () => {
    expect(ledgerProxyUrl('abc123')).toBe('/api/ledger?gameId=abc123');
  });

  it('encodes special characters', () => {
    expect(ledgerProxyUrl('a b')).toBe('/api/ledger?gameId=a+b');
  });
});
