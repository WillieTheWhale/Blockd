/**
 * Database Utility Functions
 *
 * Helper functions for database operations in tests.
 */

import { PrismaClient } from '@prisma/client';
import { UserFactory, SessionFactory, QuestionFactory } from '../fixtures/factories';

const prisma = new PrismaClient();

/**
 * Create a test user in the database
 */
export async function createTestUser(overrides = {}) {
  const user = UserFactory.create(overrides);

  return await prisma.user.create({
    data: {
      id: user.id,
      email: user.email,
      password: user.password,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      company: user.company,
      isVerified: user.isVerified,
      mfaEnabled: user.mfaEnabled,
      mfaSecret: user.mfaSecret || null,
    },
  });
}

/**
 * Create a test session in the database
 */
export async function createTestSession(overrides = {}) {
  const session = SessionFactory.create(overrides);

  return await prisma.session.create({
    data: {
      id: session.id,
      title: session.title,
      candidateName: session.candidateName,
      candidateEmail: session.candidateEmail,
      position: session.position,
      duration: session.duration,
      status: session.status,
      scheduledAt: session.scheduledAt || null,
      startedAt: session.startedAt || null,
      endedAt: session.endedAt || null,
      actualDuration: session.actualDuration || null,
      interviewerId: session.interviewerId,
      inviteToken: session.inviteToken,
    },
  });
}

/**
 * Create a test question in the database
 */
export async function createTestQuestion(overrides = {}) {
  const question = QuestionFactory.create(overrides);

  return await prisma.question.create({
    data: {
      id: question.id,
      text: question.text,
      difficulty: question.difficulty,
      category: question.category,
      expectedDuration: question.expectedDuration,
      tags: question.tags || [],
    },
  });
}

/**
 * Associate a question with a session
 */
export async function associateQuestionWithSession(
  sessionId: string,
  questionId: string,
  order: number = 1
) {
  return await prisma.sessionQuestion.create({
    data: {
      sessionId,
      questionId,
      order,
    },
  });
}

/**
 * Create a complete test scenario (user + session + questions)
 */
export async function createCompleteTestScenario() {
  // Create user
  const user = await createTestUser({
    email: 'scenario@test.blockd.site',
    role: 'interviewer',
  });

  // Create session
  const session = await createTestSession({
    interviewerId: user.id,
    status: 'scheduled',
  });

  // Create questions
  const question1 = await createTestQuestion({
    category: 'technical',
    difficulty: 'medium',
  });

  const question2 = await createTestQuestion({
    category: 'behavioral',
    difficulty: 'easy',
  });

  // Associate questions with session
  await associateQuestionWithSession(session.id, question1.id, 1);
  await associateQuestionWithSession(session.id, question2.id, 2);

  return {
    user,
    session,
    questions: [question1, question2],
  };
}

/**
 * Find user by email
 */
export async function findUserByEmail(email: string) {
  return await prisma.user.findUnique({
    where: { email },
  });
}

/**
 * Find session by ID
 */
export async function findSessionById(id: string) {
  return await prisma.session.findUnique({
    where: { id },
    include: {
      questions: {
        include: {
          question: true,
        },
      },
    },
  });
}

/**
 * Count records in a table
 */
export async function countRecords(tableName: string) {
  return await (prisma as any)[tableName.toLowerCase()].count();
}

/**
 * Check if database is accessible
 */
export async function isDatabaseAccessible(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database is not accessible:', error);
    return false;
  }
}

/**
 * Wait for database to be ready
 */
export async function waitForDatabase(maxRetries = 10, delayMs = 1000): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    if (await isDatabaseAccessible()) {
      console.log('✓ Database is ready');
      return;
    }

    console.log(`Waiting for database... (${i + 1}/${maxRetries})`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error('Database is not accessible after maximum retries');
}

/**
 * Get database connection info
 */
export function getDatabaseUrl(): string {
  return process.env.DATABASE_URL || 'postgresql://localhost:5432/blockd_test';
}

/**
 * Reset auto-increment sequences (PostgreSQL)
 */
export async function resetSequences() {
  // This is useful when you want to reset IDs to start from 1
  const tables = [
    'User',
    'Session',
    'Question',
    'Answer',
    'SecurityEvent',
    'AIAnalysis',
  ];

  for (const table of tables) {
    try {
      await prisma.$executeRawUnsafe(
        `ALTER SEQUENCE IF EXISTS "${table}_id_seq" RESTART WITH 1;`
      );
    } catch (error) {
      // Ignore errors if sequence doesn't exist
    }
  }

  console.log('✓ Reset database sequences');
}

/**
 * Disconnect from database
 */
export async function disconnect() {
  await prisma.$disconnect();
}

/**
 * Get Prisma client instance
 */
export function getPrismaClient(): PrismaClient {
  return prisma;
}

export default {
  createTestUser,
  createTestSession,
  createTestQuestion,
  associateQuestionWithSession,
  createCompleteTestScenario,
  findUserByEmail,
  findSessionById,
  countRecords,
  isDatabaseAccessible,
  waitForDatabase,
  getDatabaseUrl,
  resetSequences,
  disconnect,
  getPrismaClient,
};
