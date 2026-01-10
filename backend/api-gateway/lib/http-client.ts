/**
 * Inter-Service HTTP Client
 * Provides a robust HTTP client for communication between microservices
 * with retry logic, timeout handling, and error standardization
 */

import { request, Dispatcher } from 'undici';
import config from '../src/config';
import { ServiceUnavailableError, BadGatewayError } from './errors';
import {
  CircuitBreaker,
  getCircuitBreaker,
  getAuthServiceCircuitBreaker,
  getSessionServiceCircuitBreaker,
  getAiDetectionServiceCircuitBreaker,
  getEyeTrackingServiceCircuitBreaker,
} from './circuit-breaker';
import { TraceContext, createTraceHeaders, generateSpanId } from './tracing';

export interface HttpClientOptions {
  baseUrl: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  headers?: Record<string, string>;
  circuitBreaker?: CircuitBreaker;
}

export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
  traceContext?: TraceContext;
}

export interface HttpResponse<T = unknown> {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  data: T;
}

const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 1000; // 1 second

/**
 * Calculate exponential backoff delay
 */
function calculateBackoff(attempt: number, baseDelay: number): number {
  return Math.min(baseDelay * Math.pow(2, attempt), 30000); // Max 30 seconds
}

/**
 * Check if error is retryable
 */
function isRetryableError(statusCode: number): boolean {
  // Retry on server errors and rate limiting
  return statusCode >= 500 || statusCode === 429;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * HTTP Client for inter-service communication
 */
export class HttpClient {
  private baseUrl: string;
  private timeout: number;
  private retries: number;
  private retryDelay: number;
  private defaultHeaders: Record<string, string>;
  private circuitBreaker?: CircuitBreaker;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
    this.retries = options.retries ?? DEFAULT_RETRIES;
    this.retryDelay = options.retryDelay ?? DEFAULT_RETRY_DELAY;
    this.circuitBreaker = options.circuitBreaker;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'blockd-api-gateway/1.0',
      ...options.headers,
    };
  }

  /**
   * Make an HTTP request with retry logic and circuit breaker
   */
  async request<T = unknown>(options: HttpRequestOptions): Promise<HttpResponse<T>> {
    // If circuit breaker is configured, wrap the request
    if (this.circuitBreaker) {
      return this.circuitBreaker.execute(() => this.executeRequest<T>(options));
    }
    return this.executeRequest<T>(options);
  }

  /**
   * Execute the actual HTTP request with retry logic
   */
  private async executeRequest<T = unknown>(options: HttpRequestOptions): Promise<HttpResponse<T>> {
    const method = options.method || 'GET';
    const url = `${this.baseUrl}${options.path}`;
    const timeout = options.timeout ?? this.timeout;
    const maxRetries = options.retries ?? this.retries;

    // Merge headers, including trace headers if context provided
    let headers = { ...this.defaultHeaders, ...options.headers };
    if (options.traceContext) {
      const childContext: TraceContext = {
        ...options.traceContext,
        parentSpanId: options.traceContext.spanId,
        spanId: generateSpanId(),
      };
      headers = { ...headers, ...createTraceHeaders(childContext) };
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const requestOptions = {
          method,
          headers,
          headersTimeout: timeout,
          bodyTimeout: timeout,
          body: options.body && method !== 'GET' ? JSON.stringify(options.body) : undefined,
        };

        const response = await request(url, requestOptions);
        const responseBody = await response.body.text();

        let data: T;
        try {
          data = responseBody ? JSON.parse(responseBody) : null;
        } catch {
          data = responseBody as unknown as T;
        }

        // Check for retryable errors
        if (isRetryableError(response.statusCode) && attempt < maxRetries) {
          const delay = calculateBackoff(attempt, this.retryDelay);
          await sleep(delay);
          continue;
        }

        // Handle non-success responses
        if (response.statusCode >= 400) {
          const errorMessage = typeof data === 'object' && data !== null && 'message' in data
            ? (data as { message: string }).message
            : `Service returned status ${response.statusCode}`;

          if (response.statusCode >= 500) {
            throw new BadGatewayError(`Upstream service error: ${errorMessage}`);
          }

          // Return error response for client errors (4xx)
          return {
            statusCode: response.statusCode,
            headers: response.headers as Record<string, string | string[] | undefined>,
            data,
          };
        }

        return {
          statusCode: response.statusCode,
          headers: response.headers as Record<string, string | string[] | undefined>,
          data,
        };
      } catch (error) {
        lastError = error as Error;

        // Check if we should retry
        if (attempt < maxRetries) {
          const isNetworkError = (error as NodeJS.ErrnoException).code === 'ECONNREFUSED' ||
            (error as NodeJS.ErrnoException).code === 'ECONNRESET' ||
            (error as NodeJS.ErrnoException).code === 'ETIMEDOUT';

          if (isNetworkError) {
            const delay = calculateBackoff(attempt, this.retryDelay);
            await sleep(delay);
            continue;
          }
        }

        // Re-throw non-retryable errors
        if (error instanceof BadGatewayError || error instanceof ServiceUnavailableError) {
          throw error;
        }
      }
    }

    // All retries exhausted
    throw new ServiceUnavailableError(
      `Service unavailable after ${maxRetries + 1} attempts: ${lastError?.message || 'Unknown error'}`
    );
  }

  /**
   * GET request
   */
  async get<T = unknown>(path: string, options?: Omit<HttpRequestOptions, 'method' | 'path' | 'body'>): Promise<HttpResponse<T>> {
    return this.request<T>({ ...options, method: 'GET', path });
  }

  /**
   * POST request
   */
  async post<T = unknown>(path: string, body?: unknown, options?: Omit<HttpRequestOptions, 'method' | 'path' | 'body'>): Promise<HttpResponse<T>> {
    return this.request<T>({ ...options, method: 'POST', path, body });
  }

  /**
   * PUT request
   */
  async put<T = unknown>(path: string, body?: unknown, options?: Omit<HttpRequestOptions, 'method' | 'path' | 'body'>): Promise<HttpResponse<T>> {
    return this.request<T>({ ...options, method: 'PUT', path, body });
  }

  /**
   * PATCH request
   */
  async patch<T = unknown>(path: string, body?: unknown, options?: Omit<HttpRequestOptions, 'method' | 'path' | 'body'>): Promise<HttpResponse<T>> {
    return this.request<T>({ ...options, method: 'PATCH', path, body });
  }

  /**
   * DELETE request
   */
  async delete<T = unknown>(path: string, options?: Omit<HttpRequestOptions, 'method' | 'path' | 'body'>): Promise<HttpResponse<T>> {
    return this.request<T>({ ...options, method: 'DELETE', path });
  }
}

// ============================================================================
// Service-Specific Clients
// ============================================================================

/**
 * Auth Service Client
 */
export class AuthServiceClient extends HttpClient {
  constructor() {
    super({
      baseUrl: config.services.authService,
      timeout: 10000, // 10 second timeout for auth operations
      circuitBreaker: getAuthServiceCircuitBreaker(),
    });
  }

  async validateToken(token: string): Promise<HttpResponse<{ valid: boolean; user?: unknown }>> {
    return this.post('/api/v1/auth/validate', { token });
  }

  async refreshToken(refreshToken: string): Promise<HttpResponse<{ accessToken: string; refreshToken: string }>> {
    return this.post('/api/v1/auth/refresh', { refreshToken });
  }

  async revokeToken(userId: string, token: string): Promise<HttpResponse<void>> {
    return this.post('/api/v1/auth/revoke', { userId, token });
  }
}

/**
 * Session Service Client
 */
export class SessionServiceClient extends HttpClient {
  constructor() {
    super({
      baseUrl: config.services.sessionService,
      timeout: 15000, // 15 second timeout for session operations
      circuitBreaker: getSessionServiceCircuitBreaker(),
    });
  }

  async getSession(sessionId: string, authToken: string): Promise<HttpResponse<unknown>> {
    return this.get(`/api/v1/sessions/${sessionId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
  }

  async validateSessionToken(sessionToken: string): Promise<HttpResponse<{ valid: boolean; sessionId?: string }>> {
    return this.post('/api/v1/sessions/validate', { sessionToken });
  }

  async updateSessionStatus(sessionId: string, status: string, authToken: string): Promise<HttpResponse<unknown>> {
    return this.patch(`/api/v1/sessions/${sessionId}/status`, { status }, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
  }
}

/**
 * AI Detection Service Client
 */
export class AiDetectionServiceClient extends HttpClient {
  constructor() {
    super({
      baseUrl: config.services.aiDetectionService,
      timeout: 60000, // 60 second timeout for AI operations
      retries: 2, // Fewer retries for long-running operations
      circuitBreaker: getAiDetectionServiceCircuitBreaker(),
    });
  }

  async analyzeQuestion(questionText: string, sessionId: string): Promise<HttpResponse<unknown>> {
    return this.post('/api/v1/analyze/question', { questionText, sessionId });
  }

  async analyzeAnswer(questionId: string, answerText: string): Promise<HttpResponse<unknown>> {
    return this.post('/api/v1/analyze/answer', { questionId, answerText });
  }

  async getSimilarityScore(text1: string, text2: string): Promise<HttpResponse<{ score: number }>> {
    return this.post('/api/v1/similarity', { text1, text2 });
  }
}

/**
 * Eye Tracking Service Client
 */
export class EyeTrackingServiceClient extends HttpClient {
  constructor() {
    super({
      baseUrl: config.services.eyeTrackingService,
      timeout: 30000, // 30 second timeout
      circuitBreaker: getEyeTrackingServiceCircuitBreaker(),
    });
  }

  async analyzeGazeData(sessionId: string, gazeEvents: unknown[]): Promise<HttpResponse<unknown>> {
    return this.post('/api/v1/gaze/analyze', { sessionId, gazeEvents });
  }

  async getGazeHeatmap(sessionId: string): Promise<HttpResponse<unknown>> {
    return this.get(`/api/v1/gaze/heatmap/${sessionId}`);
  }
}

// ============================================================================
// Singleton Instances
// ============================================================================

let authServiceClient: AuthServiceClient | null = null;
let sessionServiceClient: SessionServiceClient | null = null;
let aiDetectionServiceClient: AiDetectionServiceClient | null = null;
let eyeTrackingServiceClient: EyeTrackingServiceClient | null = null;

export function getAuthServiceClient(): AuthServiceClient {
  if (!authServiceClient) {
    authServiceClient = new AuthServiceClient();
  }
  return authServiceClient;
}

export function getSessionServiceClient(): SessionServiceClient {
  if (!sessionServiceClient) {
    sessionServiceClient = new SessionServiceClient();
  }
  return sessionServiceClient;
}

export function getAiDetectionServiceClient(): AiDetectionServiceClient {
  if (!aiDetectionServiceClient) {
    aiDetectionServiceClient = new AiDetectionServiceClient();
  }
  return aiDetectionServiceClient;
}

export function getEyeTrackingServiceClient(): EyeTrackingServiceClient {
  if (!eyeTrackingServiceClient) {
    eyeTrackingServiceClient = new EyeTrackingServiceClient();
  }
  return eyeTrackingServiceClient;
}
