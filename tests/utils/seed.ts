/**
 * Database Seeding Script
 *
 * Seeds the test database with fixture data before running test suites.
 * This ensures consistent test data across all test runs.
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import usersFixture from '../fixtures/users.json';
import sessionsFixture from '../fixtures/sessions.json';
import questionsFixture from '../fixtures/questions.json';

const prisma = new PrismaClient();

// Hash password helper
async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, 10);
}

// Seed users
async function seedUsers() {
  console.log('Seeding users...');

  for (const user of usersFixture.users) {
    const hashedPassword = await hashPassword(user.passwordPlain);

    await prisma.user.upsert({
      where: { id: user.id },
      update: {},
      create: {
        id: user.id,
        email: user.email,
        password: hashedPassword,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        company: user.company,
        isVerified: user.isVerified,
        mfaEnabled: user.mfaEnabled,
        mfaSecret: user.mfaSecret || null,
        createdAt: new Date(user.createdAt),
        updatedAt: new Date(user.updatedAt),
      },
    });
  }

  console.log(`✓ Seeded ${usersFixture.users.length} users`);
}

// Seed sessions
async function seedSessions() {
  console.log('Seeding sessions...');

  for (const session of sessionsFixture.sessions) {
    await prisma.session.upsert({
      where: { id: session.id },
      update: {},
      create: {
        id: session.id,
        title: session.title,
        candidateName: session.candidateName,
        candidateEmail: session.candidateEmail,
        position: session.position,
        duration: session.duration,
        status: session.status,
        scheduledAt: session.scheduledAt ? new Date(session.scheduledAt) : null,
        startedAt: session.startedAt ? new Date(session.startedAt) : null,
        endedAt: session.endedAt ? new Date(session.endedAt) : null,
        actualDuration: session.actualDuration || null,
        interviewerId: session.interviewerId,
        inviteToken: session.inviteToken,
        createdAt: new Date(session.createdAt),
        updatedAt: new Date(session.updatedAt),
      },
    });
  }

  console.log(`✓ Seeded ${sessionsFixture.sessions.length} sessions`);
}

// Seed questions
async function seedQuestions() {
  console.log('Seeding questions...');

  for (const question of questionsFixture.questions) {
    await prisma.question.upsert({
      where: { id: question.id },
      update: {},
      create: {
        id: question.id,
        text: question.text,
        difficulty: question.difficulty,
        category: question.category,
        expectedDuration: question.expectedDuration || 300,
        tags: question.tags || [],
      },
    });
  }

  console.log(`✓ Seeded ${questionsFixture.questions.length} questions`);
}

// Seed question-session associations
async function seedSessionQuestions() {
  console.log('Associating questions with sessions...');

  // Associate first 3 questions with session 1
  await prisma.sessionQuestion.upsert({
    where: {
      sessionId_questionId: {
        sessionId: 'ses_test_001',
        questionId: 'q_test_001',
      },
    },
    update: {},
    create: {
      sessionId: 'ses_test_001',
      questionId: 'q_test_001',
      order: 1,
    },
  });

  await prisma.sessionQuestion.upsert({
    where: {
      sessionId_questionId: {
        sessionId: 'ses_test_001',
        questionId: 'q_test_002',
      },
    },
    update: {},
    create: {
      sessionId: 'ses_test_001',
      questionId: 'q_test_002',
      order: 2,
    },
  });

  // Associate questions with session 2
  await prisma.sessionQuestion.upsert({
    where: {
      sessionId_questionId: {
        sessionId: 'ses_test_002',
        questionId: 'q_test_004',
      },
    },
    update: {},
    create: {
      sessionId: 'ses_test_002',
      questionId: 'q_test_004',
      order: 1,
    },
  });

  console.log('✓ Associated questions with sessions');
}

// Main seed function
async function seed() {
  console.log('========================================');
  console.log('Starting database seeding...');
  console.log('========================================');

  try {
    // Run seeds in order (respecting foreign key constraints)
    await seedUsers();
    await seedSessions();
    await seedQuestions();
    await seedSessionQuestions();

    console.log('========================================');
    console.log('✓ Database seeding completed successfully');
    console.log('========================================');
  } catch (error) {
    console.error('========================================');
    console.error('✗ Error seeding database:');
    console.error(error);
    console.error('========================================');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run seed if executed directly
if (require.main === module) {
  seed();
}

export default seed;
