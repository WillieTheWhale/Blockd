/**
 * Centralized logging utility for consistent error handling and debugging
 *
 * Features:
 * - Structured logging with log levels
 * - Environment-aware (silent in production for debug/info)
 * - Context-rich error messages
 * - Safe for production (no sensitive data leakage)
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  component?: string
  action?: string
  userId?: string
  sessionId?: string
  [key: string]: unknown
}

interface LogEntry {
  level: LogLevel
  message: string
  context?: LogContext
  error?: Error
  timestamp: string
}

const isDevelopment = import.meta.env.DEV
const isTest = import.meta.env.MODE === 'test'

/**
 * Sanitize sensitive data from log context
 */
function sanitizeContext(context?: LogContext): LogContext | undefined {
  if (!context) return undefined

  const sanitized = { ...context }
  const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'authorization', 'cookie']

  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some((sensitive) => key.toLowerCase().includes(sensitive))) {
      sanitized[key] = '[REDACTED]'
    }
  }

  return sanitized
}

/**
 * Format log entry for output
 */
function formatLogEntry(entry: LogEntry): string {
  const contextStr = entry.context ? ` ${JSON.stringify(sanitizeContext(entry.context))}` : ''
  return `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}${contextStr}`
}

/**
 * Log a debug message (only in development)
 */
export function logDebug(message: string, context?: LogContext): void {
  if (!isDevelopment || isTest) return

  const entry: LogEntry = {
    level: 'debug',
    message,
    timestamp: new Date().toISOString(),
  }
  if (context) entry.context = context

  console.debug(formatLogEntry(entry))
}

/**
 * Log an info message (only in development)
 */
export function logInfo(message: string, context?: LogContext): void {
  if (!isDevelopment || isTest) return

  const entry: LogEntry = {
    level: 'info',
    message,
    timestamp: new Date().toISOString(),
  }
  if (context) entry.context = context

  console.info(formatLogEntry(entry))
}

/**
 * Log a warning message (always logs)
 */
export function logWarn(message: string, context?: LogContext): void {
  if (isTest) return

  const entry: LogEntry = {
    level: 'warn',
    message,
    timestamp: new Date().toISOString(),
  }
  if (context) entry.context = context

  console.warn(formatLogEntry(entry))
}

/**
 * Log an error message (always logs)
 * Includes error stack trace in development
 */
export function logError(message: string, error?: Error | unknown, context?: LogContext): void {
  if (isTest) return

  const errorObj = error instanceof Error ? error : undefined
  const entry: LogEntry = {
    level: 'error',
    message,
    timestamp: new Date().toISOString(),
  }
  if (context) entry.context = context
  if (errorObj) entry.error = errorObj

  console.error(formatLogEntry(entry))

  if (isDevelopment && errorObj?.stack) {
    console.error('Stack trace:', errorObj.stack)
  }
}

/**
 * Create a scoped logger with pre-filled context
 */
export function createLogger(defaultContext: LogContext) {
  return {
    debug: (message: string, context?: LogContext) =>
      logDebug(message, { ...defaultContext, ...context }),
    info: (message: string, context?: LogContext) =>
      logInfo(message, { ...defaultContext, ...context }),
    warn: (message: string, context?: LogContext) =>
      logWarn(message, { ...defaultContext, ...context }),
    error: (message: string, error?: Error | unknown, context?: LogContext) =>
      logError(message, error, { ...defaultContext, ...context }),
  }
}

/**
 * Default logger instance
 */
export const logger = {
  debug: logDebug,
  info: logInfo,
  warn: logWarn,
  error: logError,
  create: createLogger,
}
