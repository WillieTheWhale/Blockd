/**
 * Prisma Client Singleton
 * Ensures a single instance of PrismaClient across the application
 *
 * ============================================================================
 * GATEWAY DATABASE ACCESS ARCHITECTURE
 * ============================================================================
 *
 * The API Gateway has direct database access for specific, limited purposes.
 * This is an architectural decision that balances performance, security, and
 * separation of concerns.
 *
 * ============================================================================
 * OPERATIONS APPROPRIATE FOR GATEWAY (Direct DB Access)
 * ============================================================================
 *
 * 1. AUTHENTICATION & AUTHORIZATION
 *    - User lookup for login/registration
 *    - Password verification and MFA validation
 *    - Token generation and refresh token management
 *    - Session validation for authenticated requests
 *    Rationale: Auth must be fast and cannot depend on downstream services.
 *    Security-critical operations should minimize network hops.
 *
 * 2. USER PROFILE READS
 *    - /me endpoint for current user info
 *    - Basic user existence checks
 *    Rationale: Frequently accessed, simple reads that don't require
 *    business logic from other services.
 *
 * 3. SESSION EXISTENCE VALIDATION
 *    - Checking if a session exists before routing to services
 *    - Basic authorization checks (does user own this resource?)
 *    Rationale: Reduces unnecessary calls to microservices for
 *    resources that don't exist.
 *
 * 4. RATE LIMITING STATE (via Redis, not Prisma)
 *    - Tracking request counts
 *    - MFA attempt tracking
 *    Rationale: Must be atomic and fast for every request.
 *
 * ============================================================================
 * OPERATIONS THAT SHOULD GO TO MICROSERVICES
 * ============================================================================
 *
 * 1. COMPLEX BUSINESS LOGIC
 *    - Interview session management beyond basic CRUD
 *    - AI/ML analysis and scoring
 *    - Report generation with complex calculations
 *    Route to: session-service, analysis-service, report-service
 *
 * 2. DOMAIN-SPECIFIC OPERATIONS
 *    - Gaze tracking data processing
 *    - Interview question management
 *    - Organization management with business rules
 *    Route to: respective domain microservices
 *
 * 3. OPERATIONS REQUIRING SAGA/TRANSACTIONS
 *    - Multi-step workflows
 *    - Operations that need rollback across services
 *    Route to: orchestration service or use event-driven patterns
 *
 * 4. ANALYTICS AND REPORTING
 *    - Complex aggregations
 *    - Historical data analysis
 *    - Dashboard data
 *    Route to: analytics-service
 *
 * ============================================================================
 * GUIDELINES FOR NEW ENDPOINTS
 * ============================================================================
 *
 * Ask these questions before adding direct DB access in gateway:
 *
 * 1. Is this authentication/authorization related? -> Gateway OK
 * 2. Is this a simple read without business logic? -> Gateway OK
 * 3. Does this require domain-specific rules? -> Route to microservice
 * 4. Does this involve multiple entities/transactions? -> Route to microservice
 * 5. Is this computationally expensive? -> Route to microservice
 * 6. Would this create tight coupling to domain logic? -> Route to microservice
 *
 * When in doubt, prefer routing to a microservice. The gateway should
 * remain thin and focused on cross-cutting concerns.
 *
 * ============================================================================
 */

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
    errorFormat: 'pretty',
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Gracefully disconnect Prisma on process termination
 */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}

export default prisma;
