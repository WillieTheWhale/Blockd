import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from './config';

// Controllers
import sessionController from '../controllers/session.controller';
import lifecycleController from '../controllers/session-lifecycle.controller';
import questionController from '../controllers/question.controller';
import securityEventController from '../controllers/security-event.controller';
import reportController from '../controllers/report.controller';

/**
 * Build Fastify Application
 * Creates and configures the Fastify app with routes and middleware
 */

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logging.level,
      transport: config.logging.prettyPrint
        ? {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
    },
  });

  // Register plugins
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  await app.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.window,
  });

  // Health check
  app.get('/health', async () => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'session-service',
      version: '1.0.0',
    };
  });

  // Session routes
  app.post('/sessions', sessionController.createSession.bind(sessionController));
  app.get('/sessions', sessionController.listSessions.bind(sessionController));
  app.get('/sessions/:id', sessionController.getSession.bind(sessionController));
  app.get('/sessions/token/:token', sessionController.getSessionByToken.bind(sessionController));
  app.delete('/sessions/:id', sessionController.deleteSession.bind(sessionController));

  // Session lifecycle routes
  app.post('/sessions/:id/start', lifecycleController.startSession.bind(lifecycleController));
  app.post('/sessions/:id/end', lifecycleController.endSession.bind(lifecycleController));
  app.post('/sessions/:id/cancel', lifecycleController.cancelSession.bind(lifecycleController));
  app.get('/sessions/:id/can-start', lifecycleController.canStartSession.bind(lifecycleController));
  app.get('/sessions/:id/can-end', lifecycleController.canEndSession.bind(lifecycleController));

  // Question routes
  app.get('/sessions/:sessionId/questions', questionController.getSessionQuestions.bind(questionController));
  app.get('/sessions/:sessionId/questions/next', questionController.getNextQuestion.bind(questionController));
  app.get('/questions/:id', questionController.getQuestion.bind(questionController));
  app.post('/questions/:id/ask', questionController.askQuestion.bind(questionController));
  app.post('/answers', questionController.submitAnswer.bind(questionController));

  // Security event routes
  app.post('/sessions/:id/security-events', securityEventController.logSecurityEvent.bind(securityEventController));
  app.get('/sessions/:id/security-events', securityEventController.getSecurityEvents.bind(securityEventController));
  app.get('/sessions/:id/security-events/statistics', securityEventController.getSecurityStatistics.bind(securityEventController));
  app.get('/sessions/:id/security-events/critical', securityEventController.hasCriticalEvents.bind(securityEventController));

  // Report routes
  app.post('/sessions/:id/report', reportController.generateReport.bind(reportController));
  app.get('/sessions/:id/report/export', reportController.exportReport.bind(reportController));

  // Error handler
  app.setErrorHandler((error, request, reply) => {
    app.log.error(error);

    reply.status(error.statusCode || 500).send({
      statusCode: error.statusCode || 500,
      error: error.name || 'InternalServerError',
      message: error.message || 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}

export default buildApp;
