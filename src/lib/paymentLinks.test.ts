import { describe, expect, it } from 'vitest';
import { composeVenmoPayUrl, formatZelleHandle } from './paymentLinks';

describe('composeVenmoPayUrl', () => {
  it('builds the canonical universal URL with two-decimal amount + default note', () => {
    const url = composeVenmoPayUrl({
      recipientUsername: 'kev-stmts',
      amountCents: 42500,
    });
    expect(url).toBe(
      'https://venmo.com/u/kev-stmts?txn=pay&amount=425.00&note=poker+night'
    );
  });

  it('strips a leading @ from the username', () => {
    const url = composeVenmoPayUrl({
      recipientUsername: '@kev-stmts',
      amountCents: 100,
    });
    expect(url).toContain('/u/kev-stmts?');
    expect(url).not.toContain('@kev-stmts');
  });

  it('formats fractional dollars with two decimals', () => {
    expect(
      composeVenmoPayUrl({ recipientUsername: 'a', amountCents: 1 })
    ).toContain('amount=0.01');
    expect(
      composeVenmoPayUrl({ recipientUsername: 'a', amountCents: 1234 })
    ).toContain('amount=12.34');
    expect(
      composeVenmoPayUrl({ recipientUsername: 'a', amountCents: 100000 })
    ).toContain('amount=1000.00');
  });

  it('URL-encodes a custom note', () => {
    const url = composeVenmoPayUrl({
      recipientUsername: 'a',
      amountCents: 100,
      note: 'poker game 4/27 & friends!',
    });
    expect(url).toContain('note=poker+game+4%2F27+%26+friends%21');
  });

  it('falls back to "poker night" when note is null / empty / whitespace', () => {
    for (const note of [null, '', '   ', '\t  \n'] as const) {
      const url = composeVenmoPayUrl({
        recipientUsername: 'a',
        amountCents: 100,
        note,
      });
      expect(url).toContain('note=poker+night');
    }
  });

  it('URL-encodes non-ASCII usernames in the path segment', () => {
    const url = composeVenmoPayUrl({
      recipientUsername: 'kévin',
      amountCents: 100,
    });
    expect(url).toContain('/u/k%C3%A9vin?');
  });

  it('throws on an empty username', () => {
    expect(() =>
      composeVenmoPayUrl({ recipientUsername: '   ', amountCents: 100 })
    ).toThrow(/empty/i);
    expect(() =>
      composeVenmoPayUrl({ recipientUsername: '@', amountCents: 100 })
    ).toThrow(/empty/i);
  });

  it('throws on a non-positive amount', () => {
    expect(() =>
      composeVenmoPayUrl({ recipientUsername: 'a', amountCents: 0 })
    ).toThrow(/positive/i);
    expect(() =>
      composeVenmoPayUrl({ recipientUsername: 'a', amountCents: -100 })
    ).toThrow(/positive/i);
    expect(() =>
      composeVenmoPayUrl({
        recipientUsername: 'a',
        amountCents: Number.POSITIVE_INFINITY,
      })
    ).toThrow(/positive/i);
  });
});

describe('formatZelleHandle', () => {
  it('returns the trimmed email handle as-is', () => {
    expect(formatZelleHandle('  kev@example.com  ')).toBe('kev@example.com');
  });

  it('returns the trimmed phone handle as-is (no auto-format)', () => {
    expect(formatZelleHandle('+1 (555) 010-0000')).toBe('+1 (555) 010-0000');
  });

  it('returns empty string for an all-whitespace handle', () => {
    expect(formatZelleHandle('   \t  ')).toBe('');
  });
});
