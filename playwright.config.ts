import { defineConfig, devices } from '@playwright/test';

const standardUse = {
  serviceWorkers: 'block' as const,
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173/read/',
    trace: 'retain-on-first-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /offline\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], ...standardUse },
    },
    {
      name: 'mobile',
      testIgnore: /offline\.spec\.ts/,
      use: { ...devices['Pixel 7'], ...standardUse },
    },
    {
      name: 'offline',
      testMatch: /offline\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], serviceWorkers: 'allow' },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173/read/',
    reuseExistingServer: !process.env.CI,
  },
});
