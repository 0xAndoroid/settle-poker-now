import { describe, expect, it } from 'vitest';
import {
  composeVenmoPayUrl,
  detectMobilePlatform,
  formatZelleHandle,
  isMobileUserAgent,
} from './paymentLinks';

describe('composeVenmoPayUrl — desktop (universal HTTPS) URL', () => {
  it('builds the canonical universal URL with two-decimal amount + default note', () => {
    const url = composeVenmoPayUrl({
      recipientUsername: 'kev-stmts',
      amountCents: 42500,
      platform: 'desktop',
    });
    expect(url).toBe(
      'https://venmo.com/u/kev-stmts?txn=pay&amount=425.00&note=poker+night'
    );
  });

  it('strips a leading @ from the username', () => {
    const url = composeVenmoPayUrl({
      recipientUsername: '@kev-stmts',
      amountCents: 100,
      platform: 'desktop',
    });
    expect(url).toContain('/u/kev-stmts?');
    expect(url).not.toContain('@kev-stmts');
  });

  it('formats fractional dollars with two decimals', () => {
    expect(
      composeVenmoPayUrl({
        recipientUsername: 'a',
        amountCents: 1,
        platform: 'desktop',
      })
    ).toContain('amount=0.01');
    expect(
      composeVenmoPayUrl({
        recipientUsername: 'a',
        amountCents: 1234,
        platform: 'desktop',
      })
    ).toContain('amount=12.34');
    expect(
      composeVenmoPayUrl({
        recipientUsername: 'a',
        amountCents: 100000,
        platform: 'desktop',
      })
    ).toContain('amount=1000.00');
  });

  it('URL-encodes a custom note', () => {
    const url = composeVenmoPayUrl({
      recipientUsername: 'a',
      amountCents: 100,
      note: 'poker game 4/27 & friends!',
      platform: 'desktop',
    });
    expect(url).toContain('note=poker+game+4%2F27+%26+friends%21');
  });

  it('falls back to "poker night" when note is null / empty / whitespace', () => {
    for (const note of [null, '', '   ', '\t  \n'] as const) {
      const url = composeVenmoPayUrl({
        recipientUsername: 'a',
        amountCents: 100,
        note,
        platform: 'desktop',
      });
      expect(url).toContain('note=poker+night');
    }
  });

  it('URL-encodes non-ASCII usernames in the path segment', () => {
    const url = composeVenmoPayUrl({
      recipientUsername: 'kévin',
      amountCents: 100,
      platform: 'desktop',
    });
    expect(url).toContain('/u/k%C3%A9vin?');
  });
});

describe('composeVenmoPayUrl — mobile (venmo:// custom scheme)', () => {
  it('builds the canonical mobile URL with `recipients=` param', () => {
    const url = composeVenmoPayUrl({
      recipientUsername: 'kev-stmts',
      amountCents: 42500,
      platform: 'mobile',
    });
    expect(url).toBe(
      'venmo://paycharge?txn=pay&recipients=kev-stmts&amount=425.00&note=poker+night'
    );
  });

  it('puts the username in `recipients=`, never in the path', () => {
    const url = composeVenmoPayUrl({
      recipientUsername: 'kev-stmts',
      amountCents: 100,
      platform: 'mobile',
    });
    expect(url).toMatch(/^venmo:\/\/paycharge\?/);
    expect(url).not.toContain('/u/');
    expect(url).toContain('recipients=kev-stmts');
  });

  it('still strips a leading @ from the username', () => {
    const url = composeVenmoPayUrl({
      recipientUsername: '@kev-stmts',
      amountCents: 100,
      platform: 'mobile',
    });
    expect(url).toContain('recipients=kev-stmts');
    expect(url).not.toContain('@kev-stmts');
  });

  it('respects the same note + amount semantics as the desktop URL', () => {
    const url = composeVenmoPayUrl({
      recipientUsername: 'a',
      amountCents: 1234,
      note: 'dinner',
      platform: 'mobile',
    });
    expect(url).toContain('amount=12.34');
    expect(url).toContain('note=dinner');
  });

  it('falls back to "poker night" when note is null', () => {
    const url = composeVenmoPayUrl({
      recipientUsername: 'a',
      amountCents: 100,
      note: null,
      platform: 'mobile',
    });
    expect(url).toContain('note=poker+night');
  });
});

describe('composeVenmoPayUrl — shared validation', () => {
  it('throws on an empty username', () => {
    for (const platform of ['mobile', 'desktop'] as const) {
      expect(() =>
        composeVenmoPayUrl({
          recipientUsername: '   ',
          amountCents: 100,
          platform,
        })
      ).toThrow(/empty/i);
      expect(() =>
        composeVenmoPayUrl({
          recipientUsername: '@',
          amountCents: 100,
          platform,
        })
      ).toThrow(/empty/i);
    }
  });

  it('throws on a non-positive amount', () => {
    for (const platform of ['mobile', 'desktop'] as const) {
      expect(() =>
        composeVenmoPayUrl({
          recipientUsername: 'a',
          amountCents: 0,
          platform,
        })
      ).toThrow(/positive/i);
      expect(() =>
        composeVenmoPayUrl({
          recipientUsername: 'a',
          amountCents: -100,
          platform,
        })
      ).toThrow(/positive/i);
      expect(() =>
        composeVenmoPayUrl({
          recipientUsername: 'a',
          amountCents: Number.POSITIVE_INFINITY,
          platform,
        })
      ).toThrow(/positive/i);
    }
  });
});

describe('isMobileUserAgent', () => {
  // Real-world UA samples — captured from device DevTools.
  it.each([
    [
      'iPhone 14 (iOS 17, Safari)',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    ],
    [
      'iPad (iPadOS 16, Safari)',
      'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    ],
    [
      'iPod touch',
      'Mozilla/5.0 (iPod touch; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    ],
    [
      'Pixel 7 (Android, Chrome)',
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    ],
  ])('classifies %s as mobile', (_label, ua) => {
    expect(isMobileUserAgent(ua)).toBe(true);
  });

  it.each([
    [
      'macOS Safari',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    ],
    [
      'Windows Chrome',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ],
    [
      'Linux Firefox',
      'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
    ],
    ['empty', ''],
  ])('classifies %s as desktop', (_label, ua) => {
    expect(isMobileUserAgent(ua)).toBe(false);
  });
});

describe('detectMobilePlatform', () => {
  it('returns "desktop" under jsdom (default UA does not match the mobile regex)', () => {
    // jsdom's default UA looks like "Mozilla/5.0 (linux) AppleWebKit/...
    // jsdom/x.y.z" — no iPhone/iPad/iPod/Android. The function should
    // collapse that to 'desktop'.
    expect(detectMobilePlatform()).toBe('desktop');
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
