import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'os';
import { join } from 'path';

const port = 3210;
const baseURL = `http://localhost:${port}`;
const playwrightRoot = join(tmpdir(), 'doccanvas-playwright-root');

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './output/playwright/local-results',
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{projectName}/{arg}{ext}',
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  timeout: 60_000,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: './output/playwright/report', open: 'never' }]],
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  expect: {
    timeout: 8_000,
    toHaveScreenshot: {
      animations: 'disabled',
      maxDiffPixelRatio: 0.015,
    },
  },
  webServer: {
    command: 'npm run test:e2e:serve',
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      DOCCANVAS_ROOT: playwrightRoot,
      DOCCANVAS_WRITE_MODE: 'owner',
      DOCCANVAS_ADMIN_TOKEN_FILE: join(playwrightRoot, 'data/secrets/owner-token'),
      DOCCANVAS_SESSION_SECRET_FILE: join(playwrightRoot, 'data/secrets/session-secret'),
      DOCCANVAS_ENABLE_E2E_FIXTURES: '1',
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
    },
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'webkit-desktop',
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
  ],
});
