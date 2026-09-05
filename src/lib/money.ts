const dollarFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function centsFromDollarsString(input: string): number {
  const trimmed = input.trim().replace(/[$,\s]/g, '');
  if (!trimmed) return 0;
  const num = Number(trimmed);
  if (!Number.isFinite(num)) {
    throw new Error(`Cannot parse "${input}" as a dollar amount`);
  }
  // Round to nearest cent to avoid 1.005 → 100.49999... drift.
  return Math.round(num * 100);
}

export interface FormatOptions {
  /** Show explicit + sign for positive values. Default false. */
  signed?: boolean;
  /** Always show "$" prefix. Default true. */
  symbol?: boolean;
  /** Always show two decimal places. Default true. */
  fixedDecimals?: boolean;
}

export function formatDollars(cents: number, opts: FormatOptions = {}): string {
  const { signed = false, symbol = true, fixedDecimals = true } = opts;
  const sign = cents < 0 ? '-' : signed ? '+' : '';
  const abs = Math.abs(cents) / 100;
  const formatted = fixedDecimals
    ? dollarFormatter.format(abs)
    : abs.toLocaleString('en-US');
  return `${sign}${symbol ? '$' : ''}${formatted}`;
}

/** Quick "+$12.50" / "-$8" formatter for ledger cells. */
export function formatNet(cents: number): string {
  return formatDollars(cents, { signed: true });
}
