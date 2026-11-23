import { expect, test } from '@playwright/test';

test('the bundled demo ledger produces a payment plan', async ({ page }) => {
  await page.goto('/');
  const [ledger] = await Promise.all([
    page.waitForResponse('**/api/ledger?gameId=demo'),
    page.getByRole('button', { name: /run with demo data/ }).click(),
  ]);
  expect(await ledger.headerValue('x-demo-source')).toBe('fixture');

  const payments = page.getByRole('region', { name: /^payments/ }).getByRole('listitem');
  await expect(payments).toHaveCount(6);
  await expect(payments.filter({ hasText: /Andrew\s*→\s*Kevin/ })).toContainText('$425.00');
});
