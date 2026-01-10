/**
 * Detection Error Handler
 *
 * Provides graceful degradation strategies for detection service failures.
 * Ensures report generation continues even when external services are unavailable.
 */

import { Logger } from './logger';
import {
  DetectionServiceError,
  DetectionTimeoutError,
  DetectionUnavailableError,
  LiveDetectionResult,
  ServiceAvailability,
  ServiceStatusMap,
} from '../types/detection.types';
import { RiskLevel } from './risk-calculator';

const logger = new Logger('DetectionErrorHandler');

// =============================================================================
// Configuration
// =============================================================================

/**
 * Options for fallback behavior
 */
export interface FallbackOptions {
  /** Whether to attempt using cached data from database */
  useCachedData: boolean;
  /** Whether to use default (safe) scores when no data available */
  useDefaultScores: boolean;
  /** Whether to log errors */
  logErrors: boolean;
  /** Whether to propagate errors instead of handling them */
  propagateErrors: boolean;
  /** Custom logger to use */
  customLogger?: Logger;
}

const DEFAULT_FALLBACK_OPTIONS: FallbackOptions = {
  useCachedData: true,
  useDefaultScores: true,
  logErrors: true,
  propagateErrors: false,
};

/**
 * Result of error handling
 */
export interface ErrorHandlingResult {
  /** Whether processing should continue despite the error */
  shouldContinue: boolean;
  /** The classified error, if any */
  error?: DetectionServiceError;
  /** Fallback data to use, if available */
  fallbackData?: Partial<LiveDetectionResult>;
  /** Whether fallback data was generated */
  usingFallback: boolean;
}

// =============================================================================
// Detection Error Handler Class
// =============================================================================

/**
 * Handler for detection service errors
 *
 * Provides strategies for graceful degradation when detection services fail:
 * 1. Classify the error (timeout, network, validation, etc.)
 * 2. Log appropriate information
 * 3. Generate fallback data if possible
 * 4. Determine whether to continue processing
 */
export class DetectionErrorHandler {
  /**
   * Handle a detection service error
   *
   * @param error The error that occurred
   * @param serviceName Name of the service that failed
   * @param options Fallback behavior options
   * @returns Error handling result with fallback data
   */
  static async handleServiceError(
    error: unknown,
    serviceName: 'ai-detection' | 'eye-tracking' | 'response-timing' | 'aggregation',
    options: Partial<FallbackOptions> = {}
  ): Promise<ErrorHandlingResult> {
    const opts = { ...DEFAULT_FALLBACK_OPTIONS, ...options };
    const log = opts.customLogger || logger;

    // Classify the error
    const detectionError = this.classifyError(error, serviceName);

    // Log the error
    if (opts.logErrors) {
      log.warn(`Detection service error: ${serviceName}`, {
        errorType: detectionError.name,
        message: detectionError.message,
        statusCode: detectionError.statusCode,
        service: serviceName,
      });
    }

    // Determine if we should continue or propagate
    if (opts.propagateErrors) {
      return {
        shouldContinue: false,
        error: detectionError,
        usingFallback: false,
      };
    }

    // Generate fallback data
    let fallbackData: Partial<LiveDetectionResult> | undefined;
    if (opts.useDefaultScores) {
      fallbackData = this.generateFallbackData(serviceName, detectionError.message);
    }

    return {
      shouldContinue: true,
      error: detectionError,
      fallbackData,
      usingFallback: Boolean(fallbackData),
    };
  }

  /**
   * Handle multiple service errors and aggregate results
   */
  static aggregateErrors(
    errors: Array<{ service: string; error?: DetectionServiceError }>
  ): {
    hasErrors: boolean;
    allServicesDown: boolean;
    errorMessages: string[];
    serviceStatus: ServiceStatusMap;
  } {
    const errorMessages: string[] = [];
    const serviceStatus: ServiceStatusMap = {
      aiDetection: 'available',
      eyeTracking: 'available',
      responseTiming: 'available',
    };

    for (const { service, error } of errors) {
      if (error) {
        errorMessages.push(`${service}: ${error.message}`);

        switch (service) {
          case 'ai-detection':
            serviceStatus.aiDetection = 'unavailable';
            break;
          case 'eye-tracking':
            serviceStatus.eyeTracking = 'unavailable';
            break;
          case 'response-timing':
            serviceStatus.responseTiming = 'unavailable';
            break;
        }
      }
    }

    const hasErrors = errorMessages.length > 0;
    const allServicesDown =
      serviceStatus.aiDetection === 'unavailable' &&
      serviceStatus.eyeTracking === 'unavailable' &&
      serviceStatus.responseTiming === 'unavailable';

    return {
      hasErrors,
      allServicesDown,
      errorMessages,
      serviceStatus,
    };
  }

  // ===========================================================================
  // Private Helper Methods
  // ===========================================================================

  /**
   * Classify an unknown error into a specific detection error type
   */
  private static classifyError(
    error: unknown,
    serviceName: 'ai-detection' | 'eye-tracking' | 'response-timing' | 'aggregation'
  ): DetectionServiceError {
    // Already a DetectionServiceError
    if (error instanceof DetectionServiceError) {
      return error;
    }

    // Check for timeout
    if (this.isTimeoutError(error)) {
      return new DetectionTimeoutError(serviceName, this.extractTimeout(error));
    }

    // Check for network error
    if (this.isNetworkError(error)) {
      return new DetectionUnavailableError(serviceName, this.extractNetworkReason(error));
    }

    // Check for HTTP error
    if (this.isHttpError(error)) {
      const statusCode = this.extractStatusCode(error);
      const message = this.extractErrorMessage(error);
      return new DetectionServiceError(message, serviceName, statusCode, error);
    }

    // Generic error
    const message = error instanceof Error ? error.message : String(error);
    return new DetectionServiceError(message, serviceName, 500, error);
  }

  /**
   * Check if error is a timeout
   */
  private static isTimeoutError(error: unknown): boolean {
    if (typeof error === 'object' && error !== null) {
      const err = error as Record<string, unknown>;
      return (
        err.code === 'ECONNABORTED' ||
        err.code === 'ETIMEDOUT' ||
        (typeof err.message === 'string' && err.message.includes('timeout'))
      );
    }
    return false;
  }

  /**
   * Check if error is a network error
   */
  private static isNetworkError(error: unknown): boolean {
    if (typeof error === 'object' && error !== null) {
      const err = error as Record<string, unknown>;
      return (
        err.code === 'ECONNREFUSED' ||
        err.code === 'ENOTFOUND' ||
        err.code === 'ENETUNREACH' ||
        err.code === 'ECONNRESET' ||
        err.code === 'EPIPE' ||
        (!err.response && err.request !== undefined)
      );
    }
    return false;
  }

  /**
   * Check if error is an HTTP error
   */
  private static isHttpError(error: unknown): boolean {
    if (typeof error === 'object' && error !== null) {
      const err = error as Record<string, unknown>;
      return err.response !== undefined && typeof (err.response as Record<string, unknown>)?.status === 'number';
    }
    return false;
  }

  /**
   * Extract timeout value from error
   */
  private static extractTimeout(error: unknown): number {
    if (typeof error === 'object' && error !== null) {
      const err = error as Record<string, unknown>;
      if (typeof err.timeout === 'number') {
        return err.timeout;
      }
      // Try to extract from config
      const config = err.config as Record<string, unknown> | undefined;
      if (config && typeof config.timeout === 'number') {
        return config.timeout;
      }
    }
    return 30000; // Default timeout
  }

  /**
   * Extract network error reason
   */
  private static extractNetworkReason(error: unknown): string {
    if (typeof error === 'object' && error !== null) {
      const err = error as Record<string, unknown>;
      switch (err.code) {
        case 'ECONNREFUSED':
          return 'Connection refused - service may not be running';
        case 'ENOTFOUND':
          return 'Host not found - DNS resolution failed';
        case 'ENETUNREACH':
          return 'Network unreachable';
        case 'ECONNRESET':
          return 'Connection reset by server';
        case 'EPIPE':
          return 'Broken pipe - connection closed unexpectedly';
        default:
          return 'Network error';
      }
    }
    return 'Unknown network error';
  }

  /**
   * Extract HTTP status code from error
   */
  private static extractStatusCode(error: unknown): number {
    if (typeof error === 'object' && error !== null) {
      const err = error as Record<string, unknown>;
      const response = err.response as Record<string, unknown> | undefined;
      if (response && typeof response.status === 'number') {
        return response.status;
      }
    }
    return 500;
  }

  /**
   * Extract error message from error response
   */
  private static extractErrorMessage(error: unknown): string {
    if (typeof error === 'object' && error !== null) {
      const err = error as Record<string, unknown>;
      const response = err.response as Record<string, unknown> | undefined;
      if (response?.data) {
        const data = response.data as Record<string, unknown>;
        if (typeof data.message === 'string') {
          return data.message;
        }
        if (typeof data.error === 'string') {
          return data.error;
        }
        if (typeof data.detail === 'string') {
          return data.detail;
        }
      }
    }
    return 'Service error';
  }

  /**
   * Generate fallback data for a failed service
   */
  private static generateFallbackData(
    serviceName: string,
    errorMessage: string
  ): Partial<LiveDetectionResult> {
    const baseData: Partial<LiveDetectionResult> = {
      calculatedAt: new Date().toISOString(),
      errors: [`${serviceName} unavailable: ${errorMessage}`],
      confidence: 0.3, // Low confidence due to missing data
      processingTimeMs: 0,
    };

    switch (serviceName) {
      case 'ai-detection':
        return {
          ...baseData,
          aiDetectionScore: 0,
          aiDetection: [],
          serviceStatus: {
            aiDetection: 'unavailable',
            eyeTracking: 'unavailable',
            responseTiming: 'unavailable',
          },
        };

      case 'eye-tracking':
        return {
          ...baseData,
          gazeAnomalyScore: 0,
          eyeTracking: undefined,
        };

      case 'response-timing':
        return {
          ...baseData,
          timingAnomalyScore: 0,
          responseTiming: [],
        };

      case 'aggregation':
        return {
          ...baseData,
          overallRiskScore: 0,
          overallRiskLevel: 'low' as RiskLevel,
          aiDetectionScore: 0,
          gazeAnomalyScore: 0,
          timingAnomalyScore: 0,
          securityEventsScore: 0,
          weights: {
            aiDetection: 0.4,
            securityEvents: 0.3,
            gazeAnomaly: 0.2,
            timingAnomaly: 0.1,
          },
          serviceStatus: {
            aiDetection: 'unavailable',
            eyeTracking: 'unavailable',
            responseTiming: 'unavailable',
          },
          allFlags: [],
        };

      default:
        return baseData;
    }
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Wrap an async function with error handling
 */
export function withDetectionErrorHandling<T>(
  fn: () => Promise<T>,
  serviceName: 'ai-detection' | 'eye-tracking' | 'response-timing' | 'aggregation',
  options?: Partial<FallbackOptions>
): () => Promise<{ result?: T; error?: DetectionServiceError; usingFallback: boolean }> {
  return async () => {
    try {
      const result = await fn();
      return { result, usingFallback: false };
    } catch (error) {
      const handled = await DetectionErrorHandler.handleServiceError(
        error,
        serviceName,
        options
      );

      if (!handled.shouldContinue) {
        throw handled.error;
      }

      return {
        error: handled.error,
        usingFallback: handled.usingFallback,
      };
    }
  };
}

/**
 * Execute multiple detection calls with combined error handling
 */
export async function executeWithFallback<T>(
  calls: Array<{
    name: 'ai-detection' | 'eye-tracking' | 'response-timing';
    fn: () => Promise<T>;
    fallback: T;
  }>,
  options?: Partial<FallbackOptions>
): Promise<{
  results: Map<string, T>;
  errors: Map<string, DetectionServiceError>;
  serviceStatus: ServiceStatusMap;
}> {
  const results = new Map<string, T>();
  const errors = new Map<string, DetectionServiceError>();

  const serviceStatus: ServiceStatusMap = {
    aiDetection: 'available',
    eyeTracking: 'available',
    responseTiming: 'available',
  };

  await Promise.all(
    calls.map(async ({ name, fn, fallback }) => {
      try {
        const result = await fn();
        results.set(name, result);
      } catch (error) {
        const handled = await DetectionErrorHandler.handleServiceError(
          error,
          name,
          options
        );

        if (handled.error) {
          errors.set(name, handled.error);
        }

        // Use fallback value
        results.set(name, fallback);

        // Update service status
        switch (name) {
          case 'ai-detection':
            serviceStatus.aiDetection = 'unavailable';
            break;
          case 'eye-tracking':
            serviceStatus.eyeTracking = 'unavailable';
            break;
          case 'response-timing':
            serviceStatus.responseTiming = 'unavailable';
            break;
        }
      }
    })
  );

  return { results, errors, serviceStatus };
}
