import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest Configuration for Unit and Integration Tests
 */
export default defineConfig({
  test: {
    // Test environment
    environment: 'node',

    // Global setup and teardown
    globalSetup: './utils/global-setup.ts',

    // Setup files run before each test file
    setupFiles: ['./utils/test-setup.ts'],

    // Test timeout
    testTimeout: 30000,

    // Hook timeout
    hookTimeout: 10000,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json', 'lcov'],
      reportsDirectory: './reports/coverage',
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.spec.ts',
        '**/*.test.ts',
        '**/mocks/**',
        '**/fixtures/**',
      ],
      lines: 80,
      functions: 75,
      branches: 75,
      statements: 80,
    },

    // Reporters
    reporters: ['default', 'html', 'json'],
    outputFile: {
      html: './reports/unit-tests.html',
      json: './reports/unit-tests.json',
    },

    // Include and exclude patterns
    include: ['**/*.{test,spec}.{js,ts}'],
    exclude: [
      'node_modules/**',
      'dist/**',
      'e2e/**',
      'load/**',
      'api/**',
    ],

    // Globals
    globals: true,

    // Pool options
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
      },
    },

    // Sequence
    sequence: {
      shuffle: false,
    },

    // Watch mode
    watch: false,

    // Isolation
    isolate: true,

    // Threads
    threads: true,

    // Silent mode
    silent: false,

    // UI (for vitest --ui)
    ui: false,

    // Alias
    alias: {
      '@': path.resolve(__dirname, '../'),
      '@tests': path.resolve(__dirname, './'),
      '@fixtures': path.resolve(__dirname, './fixtures'),
      '@mocks': path.resolve(__dirname, './mocks'),
      '@utils': path.resolve(__dirname, './utils'),
    },
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../'),
      '@tests': path.resolve(__dirname, './'),
      '@fixtures': path.resolve(__dirname, './fixtures'),
      '@mocks': path.resolve(__dirname, './mocks'),
      '@utils': path.resolve(__dirname, './utils'),
    },
  },
});
