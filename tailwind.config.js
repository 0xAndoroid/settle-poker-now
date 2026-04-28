/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"Inter Tight"',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'system-ui',
          'sans-serif',
        ],
        mono: [
          '"JetBrains Mono"',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Consolas',
          'monospace',
        ],
      },
      colors: {
        // Dark (default) palette — trading-terminal charcoal stack
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        'surface-3': 'rgb(var(--surface-3) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        'line-strong': 'rgb(var(--line-strong) / <alpha-value>)',
        fg: 'rgb(var(--fg) / <alpha-value>)',
        'fg-dim': 'rgb(var(--fg-dim) / <alpha-value>)',
        'fg-mute': 'rgb(var(--fg-mute) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'accent-2': 'rgb(var(--accent-2) / <alpha-value>)',
        gain: 'rgb(var(--gain) / <alpha-value>)',
        loss: 'rgb(var(--loss) / <alpha-value>)',
        warn: 'rgb(var(--warn) / <alpha-value>)',
      },
      letterSpacing: {
        'ticker': '0.14em',
        'tight-2': '-0.02em',
        'tight-3': '-0.03em',
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '14px' }],
        'tick': ['11px', { lineHeight: '14px', letterSpacing: '0.14em' }],
      },
      animation: {
        'fade-in': 'fadeIn 200ms ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'live': 'live 1.6s cubic-bezier(0.4,0,0.2,1) infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        pulseSoft: {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '1' },
        },
        live: {
          '0%, 60%, 100%': { transform: 'scale(1)', opacity: '1' },
          '30%': { transform: 'scale(1.6)', opacity: '0.5' },
        },
      },
    },
  },
  plugins: [],
};
