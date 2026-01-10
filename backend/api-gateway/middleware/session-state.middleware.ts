/**
 * Session State Machine Middleware
 * Enforces valid session state transitions in the API Gateway
 * before proxying to session-service
 *
 * Session State Machine:
 *   scheduled -> active -> ended
 *       |          |
 *       v          v
 *   cancelled   cancelled
 *
 * Valid transitions:
 * - scheduled -> active (start)
 * - scheduled -> cancelled (cancel)
 * - active -> ended (end)
 * - active -> cancelled (cancel - admin only)
 */

import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { BadRequestError, ForbiddenError, NotFoundError } from '../lib/errors';
import {
  sessionServiceClient,
  ServiceClientError,
  extractAuthToken,
  ServiceTypes,
} from '../lib/service-client';

// Session status types
type SessionStatus = 'scheduled' | 'active' | 'ended' | 'cancelled';

// State machine transition definitions
interface StateTransition {
  from: SessionStatus[];
  action: string;
  to: SessionStatus;
  allowedRoles?: string[];
  errorMessage: string;
}

const STATE_TRANSITIONS: StateTransition[] = [
  {
    from: ['scheduled'],
    action: 'start',
    to: 'active',
    errorMessage: 'Session can only be started when in scheduled status',
  },
  {
    from: ['active'],
    action: 'end',
    to: 'ended',
    errorMessage: 'Session can only be ended when in active status',
  },
  {
    from: ['scheduled'],
    action: 'cancel',
    to: 'cancelled',
    errorMessage: 'Scheduled sessions can be cancelled',
  },
  {
    from: ['active'],
    action: 'cancel',
    to: 'cancelled',
    allowedRoles: ['admin'], // Only admins can cancel active sessions
    errorMessage: 'Only administrators can cancel active sessions',
  },
];

// Actions that require state validation
const STATE_CHANGING_ACTIONS = ['start', 'end', 'cancel'];

// Actions that require specific states to access
const STATE_DEPENDENT_ACTIONS: Record<string, { allowedStates: SessionStatus[]; errorMessage: string }> = {
  events: {
    allowedStates: ['active', 'ended'],
    errorMessage: 'Events are only available for active or completed sessions',
  },
  questions: {
    allowedStates: ['scheduled', 'active', 'ended'],
    errorMessage: 'Questions are not available for cancelled sessions',
  },
  report: {
    allowedStates: ['ended'],
    errorMessage: 'Reports can only be generated for completed sessions',
  },
};

/**
 * Session cache to reduce redundant lookups
 * Short TTL to ensure consistency
 */
interface CachedSession {
  session: ServiceTypes.Session;
  fetchedAt: number;
}

const sessionCache = new Map<string, CachedSession>();
const CACHE_TTL_MS = 5000; // 5 seconds

/**
 * Fetch session from cache or session-service
 */
async function getSession(
  sessionId: string,
  request: FastifyRequest
): Promise<ServiceTypes.Session | null> {
  // Check cache
  const cached = sessionCache.get(sessionId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.session;
  }

  try {
    const session = await sessionServiceClient.forward<ServiceTypes.Session>(
      'GET',
      `/sessions/${sessionId}`,
      {
        authToken: extractAuthToken(request.headers.authorization),
        userId: request.user?.userId,
        organizationId: request.user?.organizationId,
      }
    );

    // Cache the result
    sessionCache.set(sessionId, {
      session,
      fetchedAt: Date.now(),
    });

    return session;
  } catch (error) {
    if (error instanceof ServiceClientError && error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Invalidate cached session
 */
function invalidateSessionCache(sessionId: string): void {
  sessionCache.delete(sessionId);
}

/**
 * Extract action from request path
 * e.g., /sessions/:id/start -> start
 */
function extractAction(path: string): string | null {
  const parts = path.split('/');
  if (parts.length >= 4) {
    return parts[3]; // /sessions/:id/action
  }
  return null;
}

/**
 * Check if state transition is valid
 */
function isValidTransition(
  currentState: SessionStatus,
  action: string,
  userRole?: string
): { valid: boolean; errorMessage?: string } {
  const transition = STATE_TRANSITIONS.find(
    t => t.action === action && t.from.includes(currentState)
  );

  if (!transition) {
    // No transition defined for this state/action combination
    const stateDesc = STATE_TRANSITIONS.find(t => t.action === action);
    return {
      valid: false,
      errorMessage: stateDesc?.errorMessage || `Cannot ${action} session in ${currentState} status`,
    };
  }

  // Check role restrictions
  if (transition.allowedRoles && !transition.allowedRoles.includes(userRole || '')) {
    return {
      valid: false,
      errorMessage: transition.errorMessage,
    };
  }

  return { valid: true };
}

/**
 * Check if action is allowed in current state
 */
function isActionAllowedInState(
  currentState: SessionStatus,
  action: string
): { allowed: boolean; errorMessage?: string } {
  const constraint = STATE_DEPENDENT_ACTIONS[action];
  if (!constraint) {
    return { allowed: true };
  }

  if (!constraint.allowedStates.includes(currentState)) {
    return {
      allowed: false,
      errorMessage: constraint.errorMessage,
    };
  }

  return { allowed: true };
}

/**
 * Middleware to validate session state transitions
 * Use this on routes that change session state
 */
export function validateSessionStateTransition(action: string) {
  return async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<void> => {
    const sessionId = request.params.id;

    if (!sessionId) {
      throw new BadRequestError('Session ID is required');
    }

    // Fetch current session state
    const session = await getSession(sessionId, request);

    if (!session) {
      throw new NotFoundError(`Session ${sessionId} not found`);
    }

    const currentState = session.status as SessionStatus;
    const userRole = request.user?.role;

    // Validate state transition
    const transitionResult = isValidTransition(currentState, action, userRole);

    if (!transitionResult.valid) {
      request.log.warn({
        sessionId,
        currentState,
        action,
        userId: request.user?.userId,
        message: 'Invalid session state transition attempted',
      });

      throw new BadRequestError(transitionResult.errorMessage || 'Invalid state transition');
    }

    // Attach session to request for downstream use
    (request as any).session = session;

    // Invalidate cache since state will change
    invalidateSessionCache(sessionId);
  };
}

/**
 * Middleware to validate access based on session state
 * Use this on routes that read session data
 */
export function validateSessionStateAccess(action: string) {
  return async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<void> => {
    const sessionId = request.params.id;

    if (!sessionId) {
      throw new BadRequestError('Session ID is required');
    }

    // Skip validation for non-constrained actions
    if (!STATE_DEPENDENT_ACTIONS[action]) {
      return;
    }

    // Fetch current session state
    const session = await getSession(sessionId, request);

    if (!session) {
      throw new NotFoundError(`Session ${sessionId} not found`);
    }

    const currentState = session.status as SessionStatus;

    // Validate access
    const accessResult = isActionAllowedInState(currentState, action);

    if (!accessResult.allowed) {
      request.log.warn({
        sessionId,
        currentState,
        action,
        userId: request.user?.userId,
        message: 'Session access denied due to state',
      });

      throw new ForbiddenError(accessResult.errorMessage || 'Access denied');
    }

    // Attach session to request for downstream use
    (request as any).session = session;
  };
}

/**
 * Combined middleware factory for state-changing routes
 */
export const sessionStateMiddleware = {
  start: validateSessionStateTransition('start'),
  end: validateSessionStateTransition('end'),
  cancel: validateSessionStateTransition('cancel'),
  events: validateSessionStateAccess('events'),
  questions: validateSessionStateAccess('questions'),
  report: validateSessionStateAccess('report'),
};

/**
 * Decorator to add session state validation to route config
 */
export function withSessionStateValidation(
  action: keyof typeof sessionStateMiddleware
): (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => Promise<void> {
  return sessionStateMiddleware[action];
}

// Periodic cache cleanup
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of sessionCache.entries()) {
    if (now - value.fetchedAt > CACHE_TTL_MS * 2) {
      sessionCache.delete(key);
    }
  }
}, CACHE_TTL_MS * 2);

export {
  SessionStatus,
  STATE_TRANSITIONS,
  STATE_DEPENDENT_ACTIONS,
  getSession,
  invalidateSessionCache,
};
