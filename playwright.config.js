import { defineConfig, devices } from '@playwright/test';

const exe = process.env.CHROMIUM_PATH || (process.env.PLAYWRIGHT_BROWSERS_PATH ? '/opt/pw-browsers/chromium' : undefined);
const launchOptions = exe ? { executablePath: exe } : {};

// E2E_BASE_URL يشغّل الاختبارات على نسخة منشورة (مثل المعاينة) بدل خادم محلي مؤقت
const remote = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  fullyParallel: false,
  timeout: 60000,
  expect: { timeout: 8000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'tests/e2e-report' }]],
  use: { baseURL: remote || 'http://127.0.0.1:8093', locale: 'ar', timezoneId: 'Africa/Nouakchott', trace: 'retain-on-failure', screenshot: 'only-on-failure', launchOptions },
  webServer: remote ? undefined : { command: 'node tests/e2e/server.mjs', url: 'http://127.0.0.1:8093/', reuseExistingServer: false, env: { PORT: '8093' } },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.js/ },
    { name: 'desktop', dependencies: ['setup'], use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 860 }, storageState: 'tests/e2e/.auth.json' } },
    { name: 'mobile', dependencies: ['setup'], use: { ...devices['Pixel 7'], storageState: 'tests/e2e/.auth.json' } },
  ],
});
