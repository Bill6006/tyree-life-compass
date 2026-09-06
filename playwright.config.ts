import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:43173/tyree-life-compass/', trace: 'retain-on-failure' },
  projects: [
    { name: 'android-chromium', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], browserName: 'chromium' } },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 43173 --strictPort',
    url: 'http://127.0.0.1:43173/tyree-life-compass/',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
