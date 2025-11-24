import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration for Blockd Platform
 *
 * Tests are run against multiple browsers (Chromium, Firefox, WebKit)
 * to ensure cross-browser compatibility.
 */
export default defineConfig({
  testDir: './e2e',

  // Maximum time one test can run for
  timeout: 60 * 1000, // 60 seconds

  // Test execution settings
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'reports/playwright-report', open: 'never' }],
    ['junit', { outputFile: 'reports/junit/e2e-results.xml' }],
    ['list'],
  ],

  // Shared settings for all projects
  use: {
    // Base URL for tests
    baseURL: process.env.BASE_URL || 'http://localhost:3000',

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'retain-on-failure',

    // Maximum time for actions like click, fill, etc.
    actionTimeout: 10 * 1000,

    // Navigation timeout
    navigationTimeout: 30 * 1000,
  },

  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Enable permissions for WebRTC
        permissions: ['camera', 'microphone'],
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            '--disable-web-security', // For local testing only
          ],
        },
      },
    },

    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        permissions: ['camera', 'microphone'],
        launchOptions: {
          firefoxUserPrefs: {
            'media.navigator.streams.fake': true,
            'media.navigator.permission.disabled': true,
          },
        },
      },
    },

    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        permissions: ['camera', 'microphone'],
      },
    },

    // Mobile viewports for responsive testing
    {
      name: 'Mobile Chrome',
      use: {
        ...devices['Pixel 5'],
        permissions: ['camera', 'microphone'],
      },
    },

    {
      name: 'Mobile Safari',
      use: {
        ...devices['iPhone 12'],
        permissions: ['camera', 'microphone'],
      },
    },
  ],

  // Run local dev server before starting tests
  webServer: process.env.CI ? undefined : {
    command: 'npm run dev',
    cwd: '../frontend/interviewer-app',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
