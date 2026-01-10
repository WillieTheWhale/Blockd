/**
 * Database Retry Logic
 *
 * Provides retry wrappers for database operations to handle transient failures:
 * - Connection timeouts
 * - Temporary unavailability
 * - Deadlocks
 * - Transaction conflicts
 */

import { PrismaClient, Prisma } from '@prisma/client';

/**
 * Retry configuration options
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay between retries in ms (default: 100) */
  initialDelayMs?: number;
  /** Maximum delay between retries in ms (default: 5000) */
  maxDelayMs?: number;
  /** Exponential backoff factor (default: 2) */
  backoffFactor?: number;
  /** Whether to add jitter to delays (default: true) */
  jitter?: boolean;
  /** Custom function to determine if error is retryable */
  isRetryable?: (error: unknown) => boolean;
  /** Callback for logging retry attempts */
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
}

/**
 * Default retry configuration
 */
const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'isRetryable' | 'onRetry'>> = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffFactor: 2,
  jitter: true,
};

/**
 * Prisma error codes that are retryable
 * See: https://www.prisma.io/docs/reference/api-reference/error-reference
 */
const RETRYABLE_PRISMA_CODES = new Set([
  'P1001', // Can't reach database server
  'P1002', // Database server timed out
  'P1008', // Operations timed out
  'P1017', // Server closed connection
  'P2024', // Connection pool timeout
  'P2034', // Transaction conflict (write conflict)
]);

/**
 * Generic error codes that are retryable
 */
const RETRYABLE_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'EHOSTUNREACH',
  'ENETUNREACH',
]);

/**
 * Check if an error is a Prisma error with a specific code
 */
function isPrismaError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError;
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error: unknown): boolean {
  // Check Prisma errors
  if (isPrismaError(error)) {
    return RETRYABLE_PRISMA_CODES.has(error.code);
  }

  // Check for initialization errors
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }

  // Check for generic network errors
  if (error instanceof Error) {
    const errorCode = (error as any).code;
    if (errorCode && RETRYABLE_ERROR_CODES.has(errorCode)) {
      return true;
    }

    // Check message for common transient issues
    const message = error.message.toLowerCase();
    if (
      message.includes('connection') ||
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('socket hang up') ||
      message.includes('deadlock')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate delay for next retry with exponential backoff and optional jitter
 */
function calculateDelay(
  attempt: number,
  options: Required<Omit<RetryOptions, 'isRetryable' | 'onRetry'>>
): number {
  // Exponential backoff
  let delay = options.initialDelayMs * Math.pow(options.backoffFactor, attempt - 1);

  // Add jitter (±25%)
  if (options.jitter) {
    const jitterFactor = 0.75 + Math.random() * 0.5;
    delay *= jitterFactor;
  }

  // Cap at max delay
  return Math.min(delay, options.maxDelayMs);
}

/**
 * Sleep for a given duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a database operation with retry logic
 *
 * @param operation - The async operation to execute
 * @param options - Retry configuration options
 * @returns The result of the operation
 * @throws The last error if all retries fail
 *
 * @example
 * ```ts
 * const user = await withRetry(
 *   () => prisma.user.findUnique({ where: { id } }),
 *   { maxRetries: 3 }
 * );
 * ```
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const shouldRetry = options.isRetryable ?? isRetryableError;

  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (attempt > opts.maxRetries || !shouldRetry(error)) {
        throw error;
      }

      // Calculate delay
      const delayMs = calculateDelay(attempt, opts);

      // Call retry callback if provided
      if (options.onRetry) {
        options.onRetry(attempt, error, delayMs);
      }

      // Wait before retrying
      await sleep(delayMs);
    }
  }

  // Should never reach here, but TypeScript needs this
  throw lastError;
}

/**
 * Execute a database transaction with retry logic
 *
 * @param prisma - Prisma client instance
 * @param operation - The transaction operation to execute
 * @param options - Retry configuration options
 * @returns The result of the transaction
 *
 * @example
 * ```ts
 * const result = await withTransactionRetry(prisma, async (tx) => {
 *   const user = await tx.user.update({ ... });
 *   const session = await tx.session.create({ ... });
 *   return { user, session };
 * });
 * ```
 */
export async function withTransactionRetry<T>(
  prisma: PrismaClient,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  return withRetry(
    () => prisma.$transaction(operation),
    {
      ...options,
      // Use more aggressive retry for transactions
      maxRetries: options.maxRetries ?? 5,
      initialDelayMs: options.initialDelayMs ?? 50,
    }
  );
}

/**
 * Create a retryable version of a Prisma operation
 *
 * @param operation - The operation to make retryable
 * @param options - Default retry options
 * @returns A function that executes the operation with retry
 *
 * @example
 * ```ts
 * const findUserWithRetry = retryable(
 *   (id: string) => prisma.user.findUnique({ where: { id } })
 * );
 * const user = await findUserWithRetry('user-123');
 * ```
 */
export function retryable<TArgs extends any[], TResult>(
  operation: (...args: TArgs) => Promise<TResult>,
  defaultOptions: RetryOptions = {}
): (...args: TArgs) => Promise<TResult> {
  return (...args: TArgs) => withRetry(() => operation(...args), defaultOptions);
}

/**
 * Decorator for retrying class methods
 *
 * @param options - Retry configuration options
 * @returns Method decorator
 *
 * @example
 * ```ts
 * class UserService {
 *   @Retry({ maxRetries: 3 })
 *   async findUser(id: string) {
 *     return prisma.user.findUnique({ where: { id } });
 *   }
 * }
 * ```
 */
export function Retry(options: RetryOptions = {}) {
  return function (
    _target: any,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      return withRetry(() => originalMethod.apply(this, args), options);
    };

    return descriptor;
  };
}

/**
 * Check if a specific Prisma error code is retryable
 */
export function isPrismaCodeRetryable(code: string): boolean {
  return RETRYABLE_PRISMA_CODES.has(code);
}

/**
 * Add a custom retryable error code
 */
export function addRetryableCode(code: string): void {
  RETRYABLE_PRISMA_CODES.add(code);
}

/**
 * Get all retryable Prisma codes
 */
export function getRetryableCodes(): string[] {
  return Array.from(RETRYABLE_PRISMA_CODES);
}

/**
 * Create a retry wrapper with logging
 */
export function createLoggedRetry(
  logger: { warn: (obj: object, msg: string) => void }
): typeof withRetry {
  return <T>(operation: () => Promise<T>, options: RetryOptions = {}) =>
    withRetry(operation, {
      ...options,
      onRetry: (attempt, error, delayMs) => {
        logger.warn(
          {
            attempt,
            delayMs,
            error: error instanceof Error ? error.message : String(error),
            errorCode: isPrismaError(error) ? error.code : undefined,
          },
          `Database operation retry attempt ${attempt}`
        );

        // Call original onRetry if provided
        options.onRetry?.(attempt, error, delayMs);
      },
    });
}
