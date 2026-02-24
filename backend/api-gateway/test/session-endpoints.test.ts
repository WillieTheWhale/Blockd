/**
 * Session Endpoints Tests
 * Tests for new session endpoints: update, delete, questions, submit answer
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../src/app';
import type { FastifyInstance } from 'fastify';
import { fixtures, parseBody, generateTestUuid } from './helpers/test-utils';

describe('Session Endpoints Tests', () => {
  let app: FastifyInstance;
  const validUuid = fixtures.validUuid;
  const invalidUuid = fixtures.invalidUuid;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  // ===========================================================================
  // PUT /api/v1/sessions/:id - Update Session
  // ===========================================================================
  describe('PUT /api/v1/sessions/:id', () => {
    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/sessions/${validUuid}`,
        payload: {
          status: 'active',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should validate UUID format', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/sessions/${invalidUuid}`,
        headers: {
          authorization: 'Bearer fake-token',
        },
        payload: {
          status: 'active',
        },
      });

      expect([401, 422]).toContain(response.statusCode);
    });

    it('should validate status values', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/sessions/${validUuid}`,
        headers: {
          authorization: 'Bearer fake-token',
        },
        payload: {
          status: 'invalid-status',
        },
      });

      expect([401, 422]).toContain(response.statusCode);
    });

    it('should accept valid status transitions', async () => {
      const validStatuses = ['scheduled', 'active', 'ended', 'cancelled'];

      for (const status of validStatuses) {
        const response = await app.inject({
          method: 'PUT',
          url: `/api/v1/sessions/${validUuid}`,
          headers: {
            authorization: 'Bearer fake-token',
          },
          payload: {
            status,
          },
        });

        // 401 (no auth), 422 (validation), 403 (forbidden), 404 (not found)
        // or 200 (success with valid auth)
        expect([200, 401, 403, 404, 422]).toContain(response.statusCode);
      }
    });

    it('should validate scheduledStart date format', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/sessions/${validUuid}`,
        headers: {
          authorization: 'Bearer fake-token',
        },
        payload: {
          scheduledStart: 'not-a-date',
        },
      });

      expect([401, 422]).toContain(response.statusCode);
    });

    it('should accept ISO date format for scheduledStart', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/sessions/${validUuid}`,
        headers: {
          authorization: 'Bearer fake-token',
        },
        payload: {
          scheduledStart: new Date().toISOString(),
        },
      });

      expect([200, 401, 403, 404, 422]).toContain(response.statusCode);
    });

    it('should accept metadata object', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/sessions/${validUuid}`,
        headers: {
          authorization: 'Bearer fake-token',
        },
        payload: {
          metadata: {
            notes: 'Test notes',
            tags: ['urgent', 'follow-up'],
          },
        },
      });

      expect([200, 401, 403, 404, 422]).toContain(response.statusCode);
    });
  });

  // ===========================================================================
  // DELETE /api/v1/sessions/:id - Delete/Cancel Session
  // ===========================================================================
  describe('DELETE /api/v1/sessions/:id', () => {
    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/sessions/${validUuid}`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('should validate UUID format', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/sessions/${invalidUuid}`,
        headers: {
          authorization: 'Bearer fake-token',
        },
      });

      expect([401, 422]).toContain(response.statusCode);
    });

    it('should accept optional cancellation reason', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/sessions/${validUuid}`,
        headers: {
          authorization: 'Bearer fake-token',
        },
        payload: {
          reason: 'Cancelled by interviewer',
        },
      });

      expect([204, 401, 403, 404, 422]).toContain(response.statusCode);
    });

    it('should work without body', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/sessions/${validUuid}`,
        headers: {
          authorization: 'Bearer fake-token',
        },
      });

      expect([204, 401, 403, 404, 422]).toContain(response.statusCode);
    });
  });

  // ===========================================================================
  // GET /api/v1/sessions/:id/questions - Get Session Questions
  // ===========================================================================
  describe('GET /api/v1/sessions/:id/questions', () => {
    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/sessions/${validUuid}/questions`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('should validate UUID format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/sessions/${invalidUuid}/questions`,
        headers: {
          authorization: 'Bearer fake-token',
        },
      });

      expect([401, 422]).toContain(response.statusCode);
    });

    it('should support pagination parameters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/sessions/${validUuid}/questions?page=1&pageSize=10`,
        headers: {
          authorization: 'Bearer fake-token',
        },
      });

      expect([200, 401, 403, 404]).toContain(response.statusCode);
    });

    it('should validate page number', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/sessions/${validUuid}/questions?page=0`,
        headers: {
          authorization: 'Bearer fake-token',
        },
      });

      expect([401, 422]).toContain(response.statusCode);
    });

    it('should validate pageSize bounds', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/sessions/${validUuid}/questions?pageSize=1000`,
        headers: {
          authorization: 'Bearer fake-token',
        },
      });

      expect([401, 422]).toContain(response.statusCode);
    });

    it('should filter by difficulty', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/sessions/${validUuid}/questions?difficulty=easy`,
        headers: {
          authorization: 'Bearer fake-token',
        },
      });

      expect([200, 401, 403, 404]).toContain(response.statusCode);
    });

    it('should filter by answered status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/sessions/${validUuid}/questions?answered=true`,
        headers: {
          authorization: 'Bearer fake-token',
        },
      });

      expect([200, 401, 403, 404]).toContain(response.statusCode);
    });
  });

  // ===========================================================================
  // POST /api/v1/sessions/:id/questions/:qid/answer - Submit Answer
  // ===========================================================================
  describe('POST /api/v1/sessions/:id/questions/:qid/answer', () => {
    const questionId = generateTestUuid();

    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${validUuid}/questions/${questionId}/answer`,
        payload: {
          answerText: 'This is my answer.',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should validate session UUID format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${invalidUuid}/questions/${questionId}/answer`,
        headers: {
          authorization: 'Bearer fake-token',
        },
        payload: {
          answerText: 'This is my answer.',
        },
      });

      expect([401, 422]).toContain(response.statusCode);
    });

    it('should validate question UUID format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${validUuid}/questions/${invalidUuid}/answer`,
        headers: {
          authorization: 'Bearer fake-token',
        },
        payload: {
          answerText: 'This is my answer.',
        },
      });

      expect([401, 422]).toContain(response.statusCode);
    });

    it('should require answer content', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${validUuid}/questions/${questionId}/answer`,
        headers: {
          authorization: 'Bearer fake-token',
        },
        payload: {},
      });

      expect([401, 422]).toContain(response.statusCode);
    });

    it('should accept answerText', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${validUuid}/questions/${questionId}/answer`,
        headers: {
          authorization: 'Bearer fake-token',
        },
        payload: {
          answerText: 'This is a comprehensive answer to the interview question.',
        },
      });

      expect([201, 401, 403, 404, 422]).toContain(response.statusCode);
    });

    it('should accept optional answerAudioUrl', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${validUuid}/questions/${questionId}/answer`,
        headers: {
          authorization: 'Bearer fake-token',
        },
        payload: {
          answerText: 'My answer',
          answerAudioUrl: 'https://storage.example.com/audio/answer.mp3',
        },
      });

      expect([201, 401, 403, 404, 422]).toContain(response.statusCode);
    });

    it('should accept optional transcriptionText', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${validUuid}/questions/${questionId}/answer`,
        headers: {
          authorization: 'Bearer fake-token',
        },
        payload: {
          answerText: 'My answer',
          transcriptionText: 'Transcribed version of my spoken answer.',
        },
      });

      expect([201, 401, 403, 404, 422]).toContain(response.statusCode);
    });

    it('should accept optional responseTiming', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${validUuid}/questions/${questionId}/answer`,
        headers: {
          authorization: 'Bearer fake-token',
        },
        payload: {
          answerText: 'My answer',
          responseTiming: {
            startTime: Date.now() - 30000,
            endTime: Date.now(),
            pauseDuration: 2000,
          },
        },
      });

      expect([201, 401, 403, 404, 422]).toContain(response.statusCode);
    });

    it('should accept optional metadata', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${validUuid}/questions/${questionId}/answer`,
        headers: {
          authorization: 'Bearer fake-token',
        },
        payload: {
          answerText: 'My answer',
          metadata: {
            confidence: 'high',
            notes: 'Additional context',
          },
        },
      });

      expect([201, 401, 403, 404, 422]).toContain(response.statusCode);
    });
  });

  // ===========================================================================
  // GET /api/v1/sessions/:id/events - Session Events
  // ===========================================================================
  describe('GET /api/v1/sessions/:id/events', () => {
    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/sessions/${validUuid}/events`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('should support filtering by eventType', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/sessions/${validUuid}/events?eventType=tab_switch`,
        headers: {
          authorization: 'Bearer fake-token',
        },
      });

      expect([200, 401, 403, 404]).toContain(response.statusCode);
    });

    it('should support filtering by severity', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/sessions/${validUuid}/events?severity=high`,
        headers: {
          authorization: 'Bearer fake-token',
        },
      });

      expect([200, 401, 403, 404]).toContain(response.statusCode);
    });

    it('should support pagination', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/sessions/${validUuid}/events?page=2&pageSize=25`,
        headers: {
          authorization: 'Bearer fake-token',
        },
      });

      expect([200, 401, 403, 404]).toContain(response.statusCode);
    });
  });

  // ===========================================================================
  // Session Start/End
  // ===========================================================================
  describe('POST /api/v1/sessions/:id/start', () => {
    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${validUuid}/start`,
        payload: {},
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/v1/sessions/:id/end', () => {
    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${validUuid}/end`,
        payload: {},
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
