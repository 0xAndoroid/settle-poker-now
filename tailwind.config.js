/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // System stacks only — no webfonts. One sans stack everywhere;
        // mono for money / URLs / IDs.
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '"Segoe UI"',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', '"SF Mono"', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        // Flat night-indigo canvas + solid surface steps; see globals.css
        // for the source triples. Fixed-alpha entries are hairline fills
        // and intentionally do not compose with slash-opacity modifiers.
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        'surface-soft': 'rgb(var(--surface-soft) / <alpha-value>)',
        'fill-1': 'rgb(var(--hairline) / 0.04)',
        'fill-2': 'rgb(var(--hairline) / 0.08)',
        line: 'rgb(var(--hairline) / 0.07)',
        'line-strong': 'rgb(var(--hairline) / 0.16)',
        fg: 'rgb(var(--fg) / <alpha-value>)',
        'fg-dim': 'rgb(var(--fg-dim) / <alpha-value>)',
        'fg-mute': 'rgb(var(--fg-mute) / <alpha-value>)',
        // Sonokai Andromeda — one meaning per accent.
        accent: 'rgb(var(--blue) / <alpha-value>)',
        gain: 'rgb(var(--green) / <alpha-value>)',
        loss: 'rgb(var(--red) / <alpha-value>)',
        warn: 'rgb(var(--yellow) / <alpha-value>)',
        live: 'rgb(var(--purple) / <alpha-value>)',
        forced: 'rgb(var(--orange) / <alpha-value>)',
      },
      letterSpacing: {
        ticker: '0.12em',
        'tight-2': '-0.02em',
        'tight-3': '-0.03em',
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '14px' }],
        tick: ['11px', { lineHeight: '14px', letterSpacing: '0.12em' }],
      },
      keyframes: {
        live: {
          '0%, 60%, 100%': { transform: 'scale(1)', opacity: '1' },
          '30%': { transform: 'scale(1.6)', opacity: '0.5' },
        },
      },
    },
  },
  plugins: [],
};
