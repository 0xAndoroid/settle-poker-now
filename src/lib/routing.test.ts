import { describe, expect, it } from 'vitest';
import { gamePath, parseRoute } from './routing';

describe('parseRoute', () => {
  it('returns home for /', () => {
    expect(parseRoute('/')).toEqual({ kind: 'home' });
  });

  it('returns home for unknown paths', () => {
    expect(parseRoute('/about')).toEqual({ kind: 'home' });
    expect(parseRoute('/anything-else/at-all')).toEqual({ kind: 'home' });
    expect(parseRoute('/g/')).toEqual({ kind: 'home' }); // missing id
  });

  it('extracts a 6–16 char alphanumeric game id', () => {
    expect(parseRoute('/g/abc123')).toEqual({ kind: 'game', id: 'abc123' });
    expect(parseRoute('/g/abc123def456')).toEqual({
      kind: 'game',
      id: 'abc123def456',
    });
    expect(parseRoute('/g/7k3m9p2x/')).toEqual({ kind: 'game', id: '7k3m9p2x' });
  });

  it('rejects invalid characters in game id', () => {
    expect(parseRoute('/g/foo bar')).toEqual({ kind: 'home' });
    expect(parseRoute('/g/has-dashes')).toEqual({ kind: 'home' });
    expect(parseRoute('/g/x')).toEqual({ kind: 'home' }); // too short
  });
});

describe('gamePath', () => {
  it('builds /g/<id>', () => {
    expect(gamePath('abc123')).toBe('/g/abc123');
  });
});
