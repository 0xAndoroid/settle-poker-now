import { cn } from '@/lib/cn';

interface AmountProps {
  cents: number;
  /** Show explicit + sign for positive values. Default false. */
  signed?: boolean;
  /** Size / weight / color come from the call site. */
  className?: string;
}

/**
 * Money, presented warmly: display face with tabular figures, a quieter
 * dollar sign and small-set cents — a price tag, not a database cell.
 * Display-only; clipboard / deep-link paths keep using formatDollars.
 */
export function Amount({ cents, signed = false, className }: AmountProps) {
  const sign = cents < 0 ? '−' : signed ? '+' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString('en-US');
  const centsPart = String(abs % 100).padStart(2, '0');

  return (
    <span className={cn('num whitespace-nowrap', className)}>
      {sign}
      <span className="font-medium opacity-55">$</span>
      {dollars}
      <span className="text-[0.72em] opacity-55">.{centsPart}</span>
    </span>
  );
}
