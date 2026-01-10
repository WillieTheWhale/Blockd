/**
 * Case Converter Utility
 *
 * Handles snake_case <-> camelCase conversions for Python/TypeScript interop.
 * This utility is used to transform data at the boundary between:
 * - TypeScript services (camelCase convention)
 * - Python services (snake_case convention)
 */

import { AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

/**
 * Case conversion style
 */
export type CaseStyle = 'snake' | 'camel';

/**
 * Options for case conversion
 */
export interface CaseConversionOptions {
  /** Whether to recursively convert nested objects */
  deep?: boolean;
  /** Keys to exclude from conversion */
  excludeKeys?: string[];
  /** Whether to preserve original values that are not objects */
  preserveNonObjects?: boolean;
}

const DEFAULT_OPTIONS: CaseConversionOptions = {
  deep: true,
  excludeKeys: [],
  preserveNonObjects: true,
};

/**
 * Case Converter class
 *
 * Provides methods for converting between snake_case and camelCase,
 * as well as axios interceptors for automatic conversion.
 */
export class CaseConverter {
  /**
   * Convert a string from snake_case to camelCase
   */
  static snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  /**
   * Convert a string from camelCase to snake_case
   */
  static camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }

  /**
   * Convert object keys from snake_case to camelCase (deep by default)
   */
  static toCamelCase<T = unknown>(
    obj: unknown,
    options: CaseConversionOptions = {}
  ): T {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    if (obj === null || obj === undefined) {
      return obj as T;
    }

    // Handle arrays recursively
    if (Array.isArray(obj)) {
      return obj.map((item) => this.toCamelCase(item, opts)) as T;
    }

    // Handle Date objects - preserve them
    if (obj instanceof Date) {
      return obj as T;
    }

    // Handle plain objects
    if (typeof obj === 'object' && obj.constructor === Object) {
      const result: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(obj)) {
        // Skip excluded keys
        if (opts.excludeKeys?.includes(key)) {
          result[key] = value;
          continue;
        }

        const camelKey = this.snakeToCamel(key);

        // Recursively convert nested objects if deep is true
        if (opts.deep) {
          result[camelKey] = this.toCamelCase(value, opts);
        } else {
          result[camelKey] = value;
        }
      }

      return result as T;
    }

    // Return primitives as-is
    return obj as T;
  }

  /**
   * Convert object keys from camelCase to snake_case (deep by default)
   */
  static toSnakeCase<T = unknown>(
    obj: unknown,
    options: CaseConversionOptions = {}
  ): T {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    if (obj === null || obj === undefined) {
      return obj as T;
    }

    // Handle arrays recursively
    if (Array.isArray(obj)) {
      return obj.map((item) => this.toSnakeCase(item, opts)) as T;
    }

    // Handle Date objects - convert to ISO string for Python
    if (obj instanceof Date) {
      return obj.toISOString() as T;
    }

    // Handle plain objects
    if (typeof obj === 'object' && obj.constructor === Object) {
      const result: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(obj)) {
        // Skip excluded keys
        if (opts.excludeKeys?.includes(key)) {
          result[key] = value;
          continue;
        }

        const snakeKey = this.camelToSnake(key);

        // Recursively convert nested objects if deep is true
        if (opts.deep) {
          result[snakeKey] = this.toSnakeCase(value, opts);
        } else {
          result[snakeKey] = value;
        }
      }

      return result as T;
    }

    // Return primitives as-is
    return obj as T;
  }

  /**
   * Create axios request interceptor for automatic camelCase -> snake_case conversion
   */
  static createRequestInterceptor() {
    return (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
      // Convert request body to snake_case
      if (config.data) {
        config.data = this.toSnakeCase(config.data);
      }

      // Convert query params to snake_case
      if (config.params) {
        config.params = this.toSnakeCase(config.params);
      }

      return config;
    };
  }

  /**
   * Create axios response interceptor for automatic snake_case -> camelCase conversion
   */
  static createResponseInterceptor() {
    return (response: AxiosResponse): AxiosResponse => {
      // Convert response data to camelCase
      if (response.data) {
        response.data = this.toCamelCase(response.data);
      }

      return response;
    };
  }

  /**
   * Create axios error interceptor for converting error response data
   */
  static createErrorInterceptor() {
    return (error: unknown): Promise<never> => {
      // Convert error response data to camelCase
      if (error && typeof error === 'object') {
        const axiosError = error as { response?: { data?: unknown } };
        if (axiosError.response?.data) {
          axiosError.response.data = this.toCamelCase(axiosError.response.data);
        }
      }

      return Promise.reject(error);
    };
  }

  /**
   * Create all axios interceptors bundled together
   */
  static createAxiosInterceptors() {
    return {
      request: this.createRequestInterceptor(),
      response: this.createResponseInterceptor(),
      error: this.createErrorInterceptor(),
    };
  }

  /**
   * Apply interceptors to an axios instance
   */
  static applyToAxiosInstance(axiosInstance: {
    interceptors: {
      request: { use: (fn: (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig) => void };
      response: { use: (fn: (response: AxiosResponse) => AxiosResponse, errorFn: (error: unknown) => Promise<never>) => void };
    };
  }): void {
    const interceptors = this.createAxiosInterceptors();

    axiosInstance.interceptors.request.use(interceptors.request);
    axiosInstance.interceptors.response.use(interceptors.response, interceptors.error);
  }
}

// =============================================================================
// Specialized Transformers for Detection Services
// =============================================================================

/**
 * Transform Python AI Detection response to TypeScript format
 */
export function transformAIDetectionResponse<T>(response: unknown): T {
  return CaseConverter.toCamelCase<T>(response);
}

/**
 * Transform Python Eye Tracking response to TypeScript format
 * Handles special cases like `attention_drift` -> `drift`
 */
export function transformEyeTrackingResponse<T>(response: unknown): T {
  const converted = CaseConverter.toCamelCase<Record<string, unknown>>(response);

  // Handle special field mappings for patterns_detected
  if (converted.patternsDetected && typeof converted.patternsDetected === 'object') {
    const patterns = converted.patternsDetected as Record<string, unknown>;

    // Map attention_drift -> drift (Python uses attention_drift, TS uses drift)
    if ('attentionDrift' in patterns && !('drift' in patterns)) {
      patterns.drift = patterns.attentionDrift;
    }

    // Handle shifty_eyes which might be an object with 'detected' field
    if (patterns.shiftyEyes && typeof patterns.shiftyEyes === 'object') {
      const shiftyEyes = patterns.shiftyEyes as Record<string, unknown>;
      if ('detected' in shiftyEyes) {
        patterns.shiftyEyes = Boolean(shiftyEyes.detected);
      }
    }
  }

  return converted as T;
}

/**
 * Transform Python Response Timing response to TypeScript format
 * Handles metric field mappings
 */
export function transformResponseTimingResponse<T>(response: unknown): T {
  const converted = CaseConverter.toCamelCase<Record<string, unknown>>(response);

  // Handle metrics field mappings
  if (converted.timingMetrics && typeof converted.timingMetrics === 'object') {
    const metrics = converted.timingMetrics as Record<string, unknown>;

    // Ensure all expected fields exist with fallbacks
    const normalized = {
      latencyMs: metrics.responseLatencyMs ?? metrics.latencyMs ?? 0,
      responseLatencyMs: metrics.responseLatencyMs ?? metrics.latencyMs ?? 0,
      wordsPerMinute: metrics.speechRateWpm ?? metrics.wordsPerMinute ?? 0,
      speechRateWpm: metrics.speechRateWpm ?? metrics.wordsPerMinute ?? 0,
      pauseCount: metrics.pauseCount ?? 0,
      pauseDurationAvgMs: (metrics.avgPauseDurationSeconds as number ?? 0) * 1000,
      avgPauseDurationSeconds: metrics.avgPauseDurationSeconds ?? 0,
      pausePercentage: metrics.pausePercentage ?? 0,
      fillerWordCount: metrics.fillerWordCount ?? 0,
      fillerWordRatio: metrics.fillerWordRatio ?? 0,
      speechDurationMs: (metrics.speechDurationSeconds as number ?? 0) * 1000,
      speechDurationSeconds: metrics.speechDurationSeconds ?? 0,
      totalDurationMs: (metrics.totalDurationSeconds as number ?? 0) * 1000,
      totalDurationSeconds: metrics.totalDurationSeconds ?? 0,
    };

    converted.metrics = normalized;
    delete converted.timingMetrics;
  }

  // Handle anomalies - convert from boolean flags to array format
  if (converted.anomalies && typeof converted.anomalies === 'object' && !Array.isArray(converted.anomalies)) {
    const anomalyFlags = converted.anomalies as Record<string, boolean>;
    const anomalyArray: Array<{ type: string; severity: string; description: string; score: number }> = [];

    if (anomalyFlags.instantResponse) {
      anomalyArray.push({
        type: 'instant_response',
        severity: 'high',
        description: 'Response time significantly below expected threshold',
        score: 0.8,
      });
    }
    if (anomalyFlags.unnaturalConsistency) {
      anomalyArray.push({
        type: 'unnatural_consistency',
        severity: 'medium',
        description: 'Speech patterns show unnatural consistency',
        score: 0.6,
      });
    }
    if (anomalyFlags.delayedThenFluent) {
      anomalyArray.push({
        type: 'delayed_then_fluent',
        severity: 'medium',
        description: 'Long initial delay followed by fluent speech',
        score: 0.6,
      });
    }
    if (anomalyFlags.roboticSpeechPattern) {
      anomalyArray.push({
        type: 'robotic_speech_pattern',
        severity: 'high',
        description: 'Speech patterns suggest text-to-speech or reading',
        score: 0.7,
      });
    }

    converted.anomalies = anomalyArray;
  }

  return converted as T;
}

/**
 * Transform TypeScript request to Python format
 */
export function transformRequestToSnakeCase<T>(request: unknown): T {
  return CaseConverter.toSnakeCase<T>(request);
}
