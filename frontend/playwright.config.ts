import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3100',
    headless: true,
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'npm run start',
      cwd: `${__dirname}/../backend`,
      env: {
        ...process.env,
        PORT: '4000',
        DISABLE_RATE_LIMITS: '1',
      },
      url: 'http://127.0.0.1:4000/health',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npm run start -- --hostname 127.0.0.1 --port 3100',
      cwd: __dirname,
      env: {
        ...process.env,
        NEXT_PUBLIC_API_URL: 'http://127.0.0.1:4000/api',
      },
      url: 'http://127.0.0.1:3100',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
