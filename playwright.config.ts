import { defineConfig, devices } from '@playwright/test';

// A separate port and a production build, so this never collides with a
// `next dev` already running on 3000 and isn't affected by dev-only
// behavior (HMR re-evaluating the in-memory fleet, on-demand compiles).
const PORT = 3100;

export default defineConfig({
  testDir: './e2e',
  // The fake backend is one shared in-memory fleet, so run serially.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    // Always a fresh server: the in-memory fleet persists for its lifetime,
    // so reusing one would let earlier runs leak state into these tests.
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
