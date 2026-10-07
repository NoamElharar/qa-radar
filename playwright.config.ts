import { defineConfig, devices } from '@playwright/test';
import { DATA_DIR } from './e2e/paths.ts';

/**
 * End-to-end tests of the production build, served by `vite preview` with generated fixture data
 * (e2e/global-setup.ts). Runs on an iPhone 15 Pro profile in WebKit (Safari's engine) and on
 * desktop Chrome.
 */
export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173/',
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'iphone-15-pro', use: { ...devices['iPhone 15 Pro'] } },
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run build -w web && npm run preview -w web -- --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
    env: { QA_RADAR_DATA_DIR: DATA_DIR },
    timeout: 120_000,
  },
});
