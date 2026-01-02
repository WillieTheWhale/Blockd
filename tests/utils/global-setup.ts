/**
 * Global Setup for Tests
 *
 * Runs once before all tests start.
 * Sets up the test environment, database, and mock servers.
 */

import dotenv from 'dotenv';
import path from 'path';
import { waitForDatabase } from './db-utils';

export default async function globalSetup() {
  console.log('========================================');
  console.log('Global Test Setup');
  console.log('========================================');

  // Load test environment variables
  dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

  console.log('✓ Test environment variables loaded');

  // Wait for database to be ready
  try {
    await waitForDatabase(10, 1000);
  } catch (error) {
    console.error('✗ Database is not accessible');
    throw error;
  }

  // Run database migrations if needed
  // This would typically be handled by your CI/CD pipeline
  console.log('✓ Database is ready');

  console.log('========================================');
  console.log('Global setup completed');
  console.log('========================================');
}
