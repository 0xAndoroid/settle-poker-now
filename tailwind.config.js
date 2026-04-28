/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: [
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Consolas',
          'monospace',
        ],
        sans: [
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'monospace',
        ],
      },
      colors: {
        paper: {
          DEFAULT: '#faf6ed',
          2: '#f1ebda',
          3: '#e8e1cb',
        },
        ink: {
          DEFAULT: '#141414',
          2: '#2c2a26',
          3: '#4a463e',
        },
        mute: {
          DEFAULT: '#6b665e',
          2: '#928b7d',
        },
        rule: '#141414',
        hairline: '#2c2a2628',
        loss: '#a8201a',
        gold: '#9a7a26',
      },
      letterSpacing: {
        masthead: '0.18em',
        all: '0.08em',
      },
      borderWidth: {
        rule: '3px',
        hairline: '1px',
      },
    },
  },
  plugins: [],
};
