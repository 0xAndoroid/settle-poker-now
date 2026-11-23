import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:8788';

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  timeout: 15_000,
  use: { baseURL },
  webServer: {
    command: 'npm run worker:dev -- --ip 127.0.0.1 --port 8788',
    url: baseURL,
    timeout: 30_000,
    env: { WRANGLER_SEND_METRICS: 'false' },
  },
});
