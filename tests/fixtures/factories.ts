/**
 * Test Data Factories
 *
 * Factory functions for generating test data with sensible defaults
 * and customizable properties.
 */

import { randomBytes } from 'crypto';

// Types
export interface User {
  id: string;
  email: string;
  password: string;
  passwordPlain?: string;
  firstName: string;
  lastName: string;
  role: 'interviewer' | 'admin' | 'candidate';
  company?: string;
  isVerified: boolean;
  mfaEnabled: boolean;
  mfaSecret?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  id: string;
  title: string;
  candidateName: string;
  candidateEmail: string;
  position: string;
  duration: number;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  scheduledAt?: Date;
  startedAt?: Date;
  endedAt?: Date;
  actualDuration?: number;
  interviewerId: string;
  inviteToken: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Question {
  id: string;
  text: string;
  difficulty: 'easy' | 'medium' | 'hard';
  category: 'technical' | 'behavioral' | 'experience' | 'coding';
  expectedDuration?: number;
  tags?: string[];
}

export interface Answer {
  id: string;
  questionId: string;
  sessionId: string;
  text: string;
  submittedAt: Date;
  timeTaken?: number;
}

export interface SecurityEvent {
  id: string;
  sessionId: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details?: Record<string, any>;
  timestamp: Date;
}

// Utility functions
function generateId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

function generateEmail(base?: string): string {
  const timestamp = Date.now();
  const random = randomBytes(4).toString('hex');
  return base
    ? `${base}_${timestamp}_${random}@test.blockd.io`
    : `user_${timestamp}_${random}@test.blockd.io`;
}

// User Factory
export class UserFactory {
  static create(overrides: Partial<User> = {}): User {
    const timestamp = new Date();
    const id = overrides.id || generateId('usr');

    return {
      id,
      email: overrides.email || generateEmail('user'),
      password: overrides.password || '$2b$10$hashedpassword',
      passwordPlain: overrides.passwordPlain || 'Test123456!',
      firstName: overrides.firstName || 'Test',
      lastName: overrides.lastName || 'User',
      role: overrides.role || 'interviewer',
      company: overrides.company || 'Test Company',
      isVerified: overrides.isVerified !== undefined ? overrides.isVerified : true,
      mfaEnabled: overrides.mfaEnabled || false,
      mfaSecret: overrides.mfaSecret,
      createdAt: overrides.createdAt || timestamp,
      updatedAt: overrides.updatedAt || timestamp,
    };
  }

  static createBatch(count: number, overrides: Partial<User> = {}): User[] {
    return Array.from({ length: count }, (_, i) =>
      this.create({
        ...overrides,
        email: overrides.email
          ? `${overrides.email}_${i}@test.blockd.io`
          : generateEmail(`user_${i}`),
      })
    );
  }

  static createInterviewer(overrides: Partial<User> = {}): User {
    return this.create({
      ...overrides,
      role: 'interviewer',
      company: overrides.company || 'Blockd Corp',
    });
  }

  static createAdmin(overrides: Partial<User> = {}): User {
    return this.create({
      ...overrides,
      role: 'admin',
      mfaEnabled: true,
      mfaSecret: 'JBSWY3DPEHPK3PXP',
    });
  }
}

// Session Factory
export class SessionFactory {
  static create(overrides: Partial<Session> = {}): Session {
    const timestamp = new Date();
    const id = overrides.id || generateId('ses');

    return {
      id,
      title: overrides.title || 'Test Interview Session',
      candidateName: overrides.candidateName || 'John Doe',
      candidateEmail: overrides.candidateEmail || generateEmail('candidate'),
      position: overrides.position || 'Software Engineer',
      duration: overrides.duration || 60,
      status: overrides.status || 'scheduled',
      scheduledAt: overrides.scheduledAt,
      startedAt: overrides.startedAt,
      endedAt: overrides.endedAt,
      actualDuration: overrides.actualDuration,
      interviewerId: overrides.interviewerId || generateId('usr'),
      inviteToken: overrides.inviteToken || generateId('invite'),
      createdAt: overrides.createdAt || timestamp,
      updatedAt: overrides.updatedAt || timestamp,
    };
  }

  static createBatch(count: number, overrides: Partial<Session> = {}): Session[] {
    return Array.from({ length: count }, (_, i) =>
      this.create({
        ...overrides,
        title: `${overrides.title || 'Test Session'} ${i + 1}`,
        candidateEmail: generateEmail(`candidate_${i}`),
      })
    );
  }

  static createScheduled(overrides: Partial<Session> = {}): Session {
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + 1); // Tomorrow

    return this.create({
      ...overrides,
      status: 'scheduled',
      scheduledAt,
    });
  }

  static createInProgress(overrides: Partial<Session> = {}): Session {
    const startedAt = new Date();
    startedAt.setMinutes(startedAt.getMinutes() - 15); // Started 15 mins ago

    return this.create({
      ...overrides,
      status: 'in_progress',
      startedAt,
      scheduledAt: new Date(startedAt.getTime() - 5 * 60000), // Scheduled 5 mins before start
    });
  }

  static createCompleted(overrides: Partial<Session> = {}): Session {
    const endedAt = new Date();
    const startedAt = new Date(endedAt.getTime() - 60 * 60000); // 1 hour before end
    const scheduledAt = new Date(startedAt.getTime() - 5 * 60000); // 5 mins before start

    return this.create({
      ...overrides,
      status: 'completed',
      scheduledAt,
      startedAt,
      endedAt,
      actualDuration: 60,
    });
  }
}

// Question Factory
export class QuestionFactory {
  static create(overrides: Partial<Question> = {}): Question {
    const id = overrides.id || generateId('q');

    return {
      id,
      text: overrides.text || 'What is your experience with this technology?',
      difficulty: overrides.difficulty || 'medium',
      category: overrides.category || 'technical',
      expectedDuration: overrides.expectedDuration || 300,
      tags: overrides.tags || ['general'],
    };
  }

  static createBatch(count: number, overrides: Partial<Question> = {}): Question[] {
    return Array.from({ length: count }, (_, i) =>
      this.create({
        ...overrides,
        text: `${overrides.text || 'Test question'} ${i + 1}`,
      })
    );
  }

  static createTechnical(overrides: Partial<Question> = {}): Question {
    return this.create({
      ...overrides,
      category: 'technical',
      text: overrides.text || 'Explain the concept of closures in JavaScript.',
      tags: ['javascript', 'fundamentals'],
    });
  }

  static createBehavioral(overrides: Partial<Question> = {}): Question {
    return this.create({
      ...overrides,
      category: 'behavioral',
      text: overrides.text || 'Tell me about a time you faced a difficult challenge.',
      tags: ['behavioral', 'problem-solving'],
    });
  }

  static createCoding(overrides: Partial<Question> = {}): Question {
    return this.create({
      ...overrides,
      category: 'coding',
      difficulty: 'hard',
      text: overrides.text || 'Implement a binary search algorithm.',
      expectedDuration: 900,
      tags: ['algorithms', 'coding'],
    });
  }
}

// Answer Factory
export class AnswerFactory {
  static create(overrides: Partial<Answer> = {}): Answer {
    const id = overrides.id || generateId('ans');

    return {
      id,
      questionId: overrides.questionId || generateId('q'),
      sessionId: overrides.sessionId || generateId('ses'),
      text: overrides.text || 'This is a sample answer to the question.',
      submittedAt: overrides.submittedAt || new Date(),
      timeTaken: overrides.timeTaken || 180,
    };
  }

  static createAIGenerated(overrides: Partial<Answer> = {}): Answer {
    return this.create({
      ...overrides,
      text:
        overrides.text ||
        `Certainly! I'd be happy to explain this concept in detail.

First, let's break down the key components:

1. The fundamental principle involves understanding the core concepts
2. This approach ensures optimal performance and scalability
3. Best practices suggest implementing robust error handling

In summary, the most effective solution combines theoretical knowledge with practical implementation. This approach ensures that we maintain code quality while achieving our objectives efficiently.`,
    });
  }

  static createHumanLike(overrides: Partial<Answer> = {}): Answer {
    return this.create({
      ...overrides,
      text:
        overrides.text ||
        `Um, well from what I remember, I think it's like... you know when you need to handle async stuff in JavaScript?

So basically, I've used promises before in my last project - we had this API thing going on. The main thing is you chain them with .then() and .catch() for errors.

Oh and there's also async/await now which is honestly way easier to read. I always forget the syntax though lol. But yeah, it makes the code look more like synchronous code which is nice.`,
    });
  }
}

// Security Event Factory
export class SecurityEventFactory {
  static create(overrides: Partial<SecurityEvent> = {}): SecurityEvent {
    const id = overrides.id || generateId('evt');

    return {
      id,
      sessionId: overrides.sessionId || generateId('ses'),
      type: overrides.type || 'window_blur',
      severity: overrides.severity || 'medium',
      details: overrides.details || {},
      timestamp: overrides.timestamp || new Date(),
    };
  }

  static createWindowBlur(sessionId: string): SecurityEvent {
    return this.create({
      sessionId,
      type: 'window_blur',
      severity: 'medium',
      details: { reason: 'Window lost focus' },
    });
  }

  static createSuspiciousProcess(sessionId: string, processName: string): SecurityEvent {
    return this.create({
      sessionId,
      type: 'suspicious_process',
      severity: 'high',
      details: { processName },
    });
  }

  static createScreenRecording(sessionId: string): SecurityEvent {
    return this.create({
      sessionId,
      type: 'screen_recording_detected',
      severity: 'critical',
      details: { method: 'MediaRecorder API' },
    });
  }

  static createMultipleMonitors(sessionId: string, count: number): SecurityEvent {
    return this.create({
      sessionId,
      type: 'multiple_monitors',
      severity: 'medium',
      details: { monitorCount: count },
    });
  }

  static createPasteDetected(sessionId: string): SecurityEvent {
    return this.create({
      sessionId,
      type: 'paste_detected',
      severity: 'low',
      details: { source: 'clipboard' },
    });
  }
}

// Export all factories
export default {
  UserFactory,
  SessionFactory,
  QuestionFactory,
  AnswerFactory,
  SecurityEventFactory,
};
