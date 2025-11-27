/**
 * Common Validation Schemas
 */

import { z } from 'zod';

// UUID validation
export const uuidSchema = z.string().uuid();

// Pagination schemas
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

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
