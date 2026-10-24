import { defineConfig } from '@playwright/test';

// Runs against the isolated reference environment (scripts/reference-env.sh),
// never against the dev servers.
const baseURL = process.env.HUB_E2E_BASE_URL ?? 'http://localhost:3100';

export default defineConfig({
  outputDir: '.state/test-results',
  snapshotPathTemplate: '.reference/{projectName}/{arg}{ext}',
  reporter: [['list'], ['html', { outputFolder: '.state/report', open: 'never' }]],
  timeout: 120_000,
  // Visiting a screen can change server state (read receipts, journal): a
  // single worker keeps the order of visits, hence the captures, identical
  // from one run to the next.
  workers: 1,
  use: {
    baseURL,
    locale: 'fr-FR',
    timezoneId: 'Africa/Dakar',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  expect: {
    timeout: 15_000,
    toHaveScreenshot: { animations: 'disabled', caret: 'hide', scale: 'css' },
  },
  projects: [
    { name: 'visual-desktop', testDir: './visual', use: { viewport: { width: 1440, height: 900 } } },
    {
      name: 'visual-mobile',
      testDir: './visual',
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
    },
    // Smoke tests change the reference data: one worker, in file order.
    { name: 'smoke', testDir: './smoke', outputDir: '.state/test-results-smoke', fullyParallel: false, use: { viewport: { width: 1440, height: 900 } } },
  ],
});
