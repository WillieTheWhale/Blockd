/**
 * Database Cleanup Script
 *
 * Truncates test data from the database after test suites complete.
 * This ensures a clean state for the next test run.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Tables to clean (in order to respect foreign key constraints)
const TABLES_TO_CLEAN = [
  'Answer',
  'SecurityEvent',
  'SessionQuestion',
  'Question',
  'Session',
  'RefreshToken',
  'User',
  'AIAnalysis',
  'GazeData',
  'Recording',
];

// Clean a specific table
async function cleanTable(tableName: string) {
  try {
    // Use deleteMany to clear all records
    const result = await (prisma as any)[tableName.toLowerCase()].deleteMany({});

    console.log(`✓ Cleaned ${tableName}: ${result.count || 0} records deleted`);
    return result.count || 0;
  } catch (error) {
    console.error(`✗ Error cleaning ${tableName}:`, error);
    throw error;
  }
}

// Clean all test data
async function cleanup() {
  console.log('========================================');
  console.log('Starting database cleanup...');
  console.log('========================================');

  let totalRecordsDeleted = 0;

  try {
    // Clean tables in reverse order of dependencies
    for (const table of TABLES_TO_CLEAN) {
      const count = await cleanTable(table);
      totalRecordsDeleted += count;
    }

    console.log('========================================');
    console.log(`✓ Database cleanup completed`);
    console.log(`Total records deleted: ${totalRecordsDeleted}`);
    console.log('========================================');
  } catch (error) {
    console.error('========================================');
    console.error('✗ Error during cleanup:');
    console.error(error);
    console.error('========================================');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Clean specific tables (useful for targeted cleanup)
async function cleanupTables(tableNames: string[]) {
  console.log('========================================');
  console.log(`Cleaning specific tables: ${tableNames.join(', ')}...`);
  console.log('========================================');

  let totalRecordsDeleted = 0;

  try {
    for (const table of tableNames) {
      const count = await cleanTable(table);
      totalRecordsDeleted += count;
    }

    console.log('========================================');
    console.log(`✓ Targeted cleanup completed`);
    console.log(`Total records deleted: ${totalRecordsDeleted}`);
    console.log('========================================');
  } catch (error) {
    console.error('========================================');
    console.error('✗ Error during targeted cleanup:');
    console.error(error);
    console.error('========================================');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Clean only test-specific data (based on ID prefixes)
async function cleanupTestData() {
  console.log('========================================');
  console.log('Cleaning test-specific data...');
  console.log('========================================');

  try {
    // Delete users with test IDs
    const usersDeleted = await prisma.user.deleteMany({
      where: {
        OR: [
          { id: { startsWith: 'usr_test_' } },
          { email: { contains: '@test.blockd.site' } },
          { email: { contains: 'test@blockd.test' } },
        ],
      },
    });

    console.log(`✓ Deleted ${usersDeleted.count} test users`);

    // Delete sessions with test IDs
    const sessionsDeleted = await prisma.session.deleteMany({
      where: {
        id: { startsWith: 'ses_test_' },
      },
    });

    console.log(`✓ Deleted ${sessionsDeleted.count} test sessions`);

    // Delete questions with test IDs
    const questionsDeleted = await prisma.question.deleteMany({
      where: {
        id: { startsWith: 'q_test_' },
      },
    });

    console.log(`✓ Deleted ${questionsDeleted.count} test questions`);

    console.log('========================================');
    console.log('✓ Test data cleanup completed');
    console.log('========================================');
  } catch (error) {
    console.error('========================================');
    console.error('✗ Error cleaning test data:');
    console.error(error);
    console.error('========================================');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run cleanup if executed directly
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--test-only')) {
    cleanupTestData();
  } else if (args.includes('--tables')) {
    const tablesIndex = args.indexOf('--tables');
    const tables = args[tablesIndex + 1]?.split(',') || [];
    if (tables.length > 0) {
      cleanupTables(tables);
    } else {
      console.error('Error: No tables specified for --tables flag');
      process.exit(1);
    }
  } else {
    cleanup();
  }
}

export { cleanup, cleanupTables, cleanupTestData };
export default cleanup;
