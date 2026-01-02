/**
 * Test Setup
 * Global test configuration and utilities
 */

// Increase timeout for all tests
jest.setTimeout(30000);

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '3003';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.JWT_PUBLIC_KEY_PATH = './test/fixtures/public.pem';

// Suppress console logs during tests (optional)
if (process.env.SUPPRESS_LOGS === 'true') {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

// Global test utilities
global.sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Cleanup after all tests
afterAll(async () => {
  // Add any global cleanup here
  await sleep(100); // Give time for async operations to complete
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
