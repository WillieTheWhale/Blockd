/**
 * Common Validation Schemas
 * Includes input length limits to prevent memory exhaustion attacks
 */

import { z } from 'zod';

// =============================================================================
// Input Length Constants
// Define maximum lengths to prevent memory exhaustion from large payloads
// =============================================================================

export const INPUT_LIMITS = {
  // String fields
  SHORT_TEXT: 100,        // Names, titles
  MEDIUM_TEXT: 500,       // Descriptions, reasons
  LONG_TEXT: 10000,       // Large text fields
  MAX_TEXT: 50000,        // Maximum text (answers, content)

  // Email
  EMAIL: 254,             // RFC 5321 limit

  // URLs
  URL: 2048,              // Common browser limit

  // Metadata/JSON
  METADATA_SIZE: 100000,  // 100KB max for JSON metadata
  ARRAY_ITEMS: 100,       // Max items in arrays

  // Pagination
  MAX_PAGE_SIZE: 100,

  // File paths
  FILE_PATH: 500,
} as const;

// UUID validation
export const uuidSchema = z.string().uuid();

// Pagination schemas with enforced limits
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(INPUT_LIMITS.MAX_PAGE_SIZE).default(20),
  sortBy: z.string().max(INPUT_LIMITS.SHORT_TEXT).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// =============================================================================
// Reusable validated string schemas with length limits
// =============================================================================

/** Short text field (names, titles) - max 100 chars */
export const shortTextSchema = z.string().min(1).max(INPUT_LIMITS.SHORT_TEXT);

/** Medium text field (descriptions, reasons) - max 500 chars */
export const mediumTextSchema = z.string().min(1).max(INPUT_LIMITS.MEDIUM_TEXT);

/** Long text field (large content) - max 10,000 chars */
export const longTextSchema = z.string().min(1).max(INPUT_LIMITS.LONG_TEXT);

/** Maximum text field (answers, full content) - max 50,000 chars */
export const maxTextSchema = z.string().min(1).max(INPUT_LIMITS.MAX_TEXT);

/** Email with RFC limit */
export const emailSchema = z.string().email().max(INPUT_LIMITS.EMAIL);

/** URL with browser limit */
export const urlSchema = z.string().url().max(INPUT_LIMITS.URL);

/**
 * Metadata schema with size limit
 * Prevents large JSON payloads that could exhaust memory
 */
export const metadataSchema = z
  .record(z.unknown())
  .optional()
  .refine(
    (val) => {
      if (!val) return true;
      try {
        return JSON.stringify(val).length <= INPUT_LIMITS.METADATA_SIZE;
      } catch {
        return false;
      }
    },
    { message: `Metadata size exceeds maximum of ${INPUT_LIMITS.METADATA_SIZE} bytes` }
  );

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

// Date range schemas
export const dateRangeSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export type DateRange = z.infer<typeof dateRangeSchema>;

// ID parameter schema
export const idParamSchema = z.object({
  id: uuidSchema,
});

export type IdParam = z.infer<typeof idParamSchema>;

// Error response schema
export const errorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    statusCode: z.number(),
    details: z.any().optional(),
  }),
  meta: z.object({
    timestamp: z.string(),
    requestId: z.string().optional(),
  }).optional(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

// Success response schema
export const successResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    meta: z.object({
      timestamp: z.string(),
      requestId: z.string().optional(),
    }).optional(),
  });

// Paginated response schema
export const paginatedResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: z.array(dataSchema),
    pagination: z.object({
      page: z.number(),
      pageSize: z.number(),
      totalPages: z.number(),
      totalItems: z.number(),
      hasNext: z.boolean(),
      hasPrev: z.boolean(),
    }),
    meta: z.object({
      timestamp: z.string(),
      requestId: z.string().optional(),
    }).optional(),
  });
