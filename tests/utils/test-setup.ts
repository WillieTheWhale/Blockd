/**
 * Test Setup
 *
 * Runs before each test file.
 * Sets up mocks, test utilities, and global test configuration.
 */

import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { resetMockLLMServer } from '../mocks/mock-llm';
import { resetMockWebRTCServer } from '../mocks/mock-webrtc';

// Reset mocks before each test file
beforeAll(() => {
  if (process.env.MOCK_EXTERNAL_SERVICES === 'true') {
    resetMockLLMServer();
    resetMockWebRTCServer();
  }
});

// Cleanup after each test file
afterAll(async () => {
  // Add any global cleanup here
});

// Reset between individual tests
beforeEach(() => {
  // Reset any test-specific state
});

afterEach(() => {
  // Cleanup after each test
});

export {};
