interface LogoProps {
  className?: string;
}

export function Logo({ className }: LogoProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label="Settle Poker Now logo"
    >
      <defs>
        <linearGradient id="spn-logo-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7c5cff" />
          <stop offset="100%" stopColor="#22c55e" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="7" fill="currentColor" className="text-ink-900 dark:text-ink-950" />
      <path
        d="M9 21 L14 12 L18 18 L23 9"
        stroke="url(#spn-logo-gradient)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="9" cy="21" r="1.8" fill="#7c5cff" />
      <circle cx="23" cy="9" r="1.8" fill="#22c55e" />
    </svg>
  );
}
