import { describe, expect, it } from 'vitest';
import { composeVenmoPayUrl, formatZelleHandle } from './paymentLinks';

describe('composeVenmoPayUrl', () => {
  it('builds the canonical pay URL with two-decimal amount + default note', () => {
    const url = composeVenmoPayUrl({
      recipientUsername: 'kev-stmts',
      amountCents: 42500,
    });
    expect(url).toBe(
      'venmo://paycharge?txn=pay&recipients=kev-stmts&amount=425.00&note=settle.andrew.ee'
    );
  });

  it('strips a leading @ from the username', () => {
    const url = composeVenmoPayUrl({
      recipientUsername: '@kev-stmts',
      amountCents: 100,
    });
    expect(url).toContain('recipients=kev-stmts');
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
      note: 'poker night & friends!',
    });
    expect(url).toContain('note=poker+night+%26+friends%21');
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
    expect(formatZelleHandle({ handle: '  kev@example.com  ', kind: 'email' })).toBe(
      'kev@example.com'
    );
  });

  it('returns the trimmed phone handle as-is (no auto-format)', () => {
    expect(formatZelleHandle({ handle: '+1 (555) 010-0000', kind: 'phone' })).toBe(
      '+1 (555) 010-0000'
    );
  });
});
