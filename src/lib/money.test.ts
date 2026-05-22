import { describe, expect, it } from 'vitest';
import { centsFromDollarsString, dollarsFromCents, formatDollars, formatNet } from './money';

describe('money', () => {
  it('rounds dollars-string to integer cents (no float drift)', () => {
    expect(centsFromDollarsString('1.23')).toBe(123);
    expect(centsFromDollarsString('$1,234.56')).toBe(123456);
    expect(centsFromDollarsString(' 0 ')).toBe(0);
    expect(centsFromDollarsString('')).toBe(0);
  });

  it('throws on garbage input', () => {
    expect(() => centsFromDollarsString('abc')).toThrow('Cannot parse "abc" as a dollar amount');
  });

  it('formats positive and negative cents', () => {
    expect(formatDollars(12345)).toBe('$123.45');
    expect(formatDollars(-12345)).toBe('-$123.45');
    expect(formatNet(0)).toBe('+$0.00');
    expect(formatNet(50)).toBe('+$0.50');
    expect(formatNet(-50)).toBe('-$0.50');
  });

  it('round-trips dollarsFromCents', () => {
    expect(dollarsFromCents(12345)).toBeCloseTo(123.45);
  });
});
