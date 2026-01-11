import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Include all chaos test files (relative to config file location)
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    root: path.resolve(__dirname),

    // Run tests sequentially to avoid port conflicts
    sequence: {
      concurrent: false,
    },

    // Longer timeout for chaos tests (services need time to start/stop)
    testTimeout: 60000,
    hookTimeout: 30000,

    // Use forks for isolation
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // Run all tests in single fork to share server state
      },
    },

    // Global setup (starts all mock services)
    globalSetup: [],

    // Reporter configuration
    reporters: ['verbose', 'json', 'html'],
    outputFile: {
      json: 'reports/chaos/results.json',
      html: 'reports/chaos/results.html',
    },

    // Coverage configuration
    coverage: {
      enabled: false, // Chaos tests don't need code coverage
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: 'reports/chaos/coverage',
    },

    // Environment
    environment: 'node',

    // Retry failed tests once (chaos tests can be flaky)
    retry: 1,

    // Bail on first failure for faster feedback
    bail: 0,

    // Watch mode settings
    watch: false,
    watchExclude: ['**/node_modules/**', '**/reports/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../../'),
    },
  },
});
