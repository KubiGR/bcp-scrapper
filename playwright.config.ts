import { defineConfig, devices } from '@playwright/test';

const API_PORT = 3101;
const WEB_PORT = 5174;

/** Real browser, real API and web app, fixture data, in-memory Postgres: no network, no Docker. */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${WEB_PORT}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @bcp/api start',
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: false,
      env: {
        HOST: '127.0.0.1',
        PORT: String(API_PORT),
        DATABASE_URL: 'pglite://memory',
        TOURNAMENT_SOURCE: 'fixtures',
        LOG_LEVEL: 'warn',
        FETCH_QUEUE_INTERVAL_MS: '200',
      },
    },
    {
      command: `pnpm --filter @bcp/web exec vite --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: false,
      env: { API_PROXY_TARGET: `http://127.0.0.1:${API_PORT}` },
    },
  ],
});
