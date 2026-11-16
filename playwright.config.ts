import { defineConfig } from '@playwright/test';

const PORT = 4173;

// E2E runs against the production build (`vite preview`), i.e. the same
// artefact that gets deployed.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/`,
    // Uses the installed Google Chrome. Set PW_BROWSER=bundled to use the
    // Chromium downloaded by `npx playwright install chromium` instead.
    ...(process.env.PW_BROWSER === 'bundled' ? {} : { channel: 'chrome' }),
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
