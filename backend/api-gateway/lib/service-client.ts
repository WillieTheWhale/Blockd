/**
 * Service Client Library
 * HTTP client for proxying requests to backend microservices
 *
 * The API Gateway should NOT directly access the database.
 * Instead, it proxies requests to specialized microservices.
 */

import { config } from '../src/config';

export interface ServiceClientOptions {
  timeout?: number;
  retries?: number;
  headers?: Record<string, string>;
}

export interface ServiceResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    statusCode: number;
    message: string;
    code?: string;
  };
}

export class ServiceClientError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ServiceClientError';
  }
}

/**
 * Generic HTTP client for making requests to backend services
 */
export class ServiceClient {
  private baseUrl: string;
  private defaultTimeout: number;
  private defaultRetries: number;

  constructor(baseUrl: string, options: ServiceClientOptions = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.defaultTimeout = options.timeout ?? 30000;
    this.defaultRetries = options.retries ?? 2;
  }

  private async makeRequest<T>(
    method: string,
    path: string,
    options: {
      body?: unknown;
      query?: Record<string, string | number | boolean | undefined>;
      headers?: Record<string, string>;
      timeout?: number;
    } = {}
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);

    // Add query parameters
    if (options.query) {
      Object.entries(options.query).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeout ?? this.defaultTimeout
    );

    try {
      const response = await fetch(url.toString(), {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const contentType = response.headers.get('content-type');
      let data: unknown;

      if (contentType?.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      if (!response.ok) {
        const errorData = data as { message?: string; error?: string; code?: string };
        throw new ServiceClientError(
          response.status,
          errorData.message || errorData.error || `Service returned ${response.status}`,
          errorData.code,
          data
        );
      }

      // Extract data from response envelope if present
      if (typeof data === 'object' && data !== null && 'data' in data) {
        return (data as { data: T }).data;
      }

      return data as T;
    } catch (error) {
      clearTimeout(timeout);

      if (error instanceof ServiceClientError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new ServiceClientError(
            504,
            'Service request timed out',
            'TIMEOUT'
          );
        }
        throw new ServiceClientError(
          503,
          `Service unavailable: ${error.message}`,
          'SERVICE_UNAVAILABLE'
        );
      }

      throw new ServiceClientError(
        500,
        'Unknown error occurred',
        'UNKNOWN_ERROR'
      );
    }
  }

  async get<T>(path: string, options?: Omit<Parameters<typeof this.makeRequest>[2], 'body'>): Promise<T> {
    return this.makeRequest<T>('GET', path, options);
  }

  async post<T>(path: string, body?: unknown, options?: Omit<Parameters<typeof this.makeRequest>[2], 'body'>): Promise<T> {
    return this.makeRequest<T>('POST', path, { ...options, body });
  }

  async put<T>(path: string, body?: unknown, options?: Omit<Parameters<typeof this.makeRequest>[2], 'body'>): Promise<T> {
    return this.makeRequest<T>('PUT', path, { ...options, body });
  }

  async patch<T>(path: string, body?: unknown, options?: Omit<Parameters<typeof this.makeRequest>[2], 'body'>): Promise<T> {
    return this.makeRequest<T>('PATCH', path, { ...options, body });
  }

  async delete<T>(path: string, options?: Omit<Parameters<typeof this.makeRequest>[2], 'body'>): Promise<T> {
    return this.makeRequest<T>('DELETE', path, options);
  }

  /**
   * Forward a request with authentication headers
   */
  async forward<T>(
    method: string,
    path: string,
    options: {
      body?: unknown;
      query?: Record<string, string | number | boolean | undefined>;
      authToken?: string;
      userId?: string;
      organizationId?: string;
    } = {}
  ): Promise<T> {
    const headers: Record<string, string> = {};

    // Forward authentication context to downstream services
    if (options.authToken) {
      headers['Authorization'] = `Bearer ${options.authToken}`;
    }
    if (options.userId) {
      headers['X-User-Id'] = options.userId;
    }
    if (options.organizationId) {
      headers['X-Organization-Id'] = options.organizationId;
    }

    return this.makeRequest<T>(method, path, {
      body: options.body,
      query: options.query,
      headers,
    });
  }
}

/**
 * Pre-configured service clients for each backend service
 */
export const authServiceClient = new ServiceClient(config.services.authService);
export const sessionServiceClient = new ServiceClient(config.services.sessionService);
export const aiDetectionServiceClient = new ServiceClient(config.services.aiDetectionService);
export const eyeTrackingServiceClient = new ServiceClient(config.services.eyeTrackingService);
export const responseTimingServiceClient = new ServiceClient(config.services.responseTimingService);
export const videoServiceClient = new ServiceClient(config.services.videoService);
export const websocketServiceClient = new ServiceClient(config.services.websocketService);

/**
 * Helper function to extract auth token from request
 */
export function extractAuthToken(authHeader?: string): string | undefined {
  if (!authHeader?.startsWith('Bearer ')) {
    return undefined;
  }
  return authHeader.slice(7);
}

/**
 * Types for service responses
 */
export namespace ServiceTypes {
  // Session Service Types
  export interface Session {
    id: string;
    organizationId: string;
    interviewerId: string;
    intervieweeId?: string;
    intervieweeEmail?: string;
    status: 'scheduled' | 'active' | 'ended' | 'cancelled';
    sessionToken?: string;
    scheduledStart?: string;
    actualStart?: string;
    actualEnd?: string;
    durationMinutes?: number;
    riskScore?: number;
    metadata?: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
  }

  export interface Question {
    id: string;
    sessionId: string;
    questionText: string;
    difficulty?: string;
    expectedDuration?: number;
    askedAt?: string;
  }

  export interface SecurityEvent {
    id: string;
    sessionId: string;
    eventType: string;
    severity: string;
    description?: string;
    metadata?: Record<string, unknown>;
    timestamp: string;
  }

  export interface SessionReport {
    id: string;
    sessionId: string;
    overallRiskScore: number;
    aiDetectionScore: number;
    gazeAnomalyScore: number;
    timingAnomalyScore: number;
    securityEventsCount: number;
    recommendations: string[];
    detailedAnalysis: Record<string, unknown>;
    generatedAt: string;
  }

  export interface PaginatedResponse<T> {
    items: T[];
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  }

  // Auth Service Types
  export interface User {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    role: string;
    organizationId?: string;
    mfaEnabled: boolean;
    emailVerified: boolean;
  }

  export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }

  export interface AuthResponse {
    user: User;
    tokens: AuthTokens;
  }

  // AI Detection Service Types
  export interface AIAnswer {
    model: string;
    answer: string;
    confidence: number;
    perplexity: number;
  }

  export interface AnswerAnalysis {
    analysisId: string;
    questionId: string;
    riskScore: number;
    isAiGenerated: boolean;
    confidence: number;
    similarityScores: Record<string, number>;
    responseTiming: {
      latencyMs: number;
      wordsPerMinute: number;
      pauseCount: number;
      fillerRatio: number;
    };
    perplexityScore: number;
    flags: Array<{
      type: string;
      severity: string;
      description: string;
    }>;
    recommendations: string[];
  }

  // Eye Tracking Service Types
  export interface GazeSummary {
    sessionId: string;
    totalEvents: number;
    offScreenEvents: number;
    offScreenPercentage: number;
    averageConfidence: number;
    offScreenDirections: Record<string, number>;
  }
}
