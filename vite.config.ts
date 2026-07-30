/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(
  readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')
) as { version: string };

/**
 * Dev-only stub for the one Pages Function the SPA needs before finalize:
 * `/api/ledger?gameId=demo` serves the bundled demo fixture so `npm run dev`
 * can exercise the full analyze flow without `wrangler pages dev`.
 */
function demoLedgerStub() {
  return {
    name: 'demo-ledger-stub',
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use('/api/ledger', (req, res, next) => {
        const url = new URL(req.url ?? '', 'http://localhost');
        if (url.searchParams.get('gameId') !== 'demo') return next();
        const csv = readFileSync(path.resolve(__dirname, 'public/demo-ledger.csv'));
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('X-Pokernow-Cents', 'true');
        res.end(csv);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), demoLedgerStub()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'functions/**/*.{test,spec}.{ts,tsx}',
    ],
  },
});
