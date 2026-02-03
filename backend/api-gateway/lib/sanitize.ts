/**
 * Input Sanitization Utilities
 * Protects against XSS, injection, and prototype pollution attacks
 */

import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize HTML content - strips all tags by default
 * @param input - Potentially unsafe HTML string
 * @param allowedTags - Optional array of allowed HTML tags
 * @returns Sanitized string
 */
export function sanitizeHtml(input: string, allowedTags: string[] = []): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: [],
  });
}

/**
 * Sanitize a plain text field - strips all HTML
 * @param input - Potentially unsafe string
 * @returns Safe plain text string
 */
export function sanitizeText(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Strip all HTML tags
  const sanitized = DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });

  // Also remove any remaining HTML entities that might be dangerous
  return sanitized
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'");
}

/**
 * Sanitize object to prevent prototype pollution
 * Creates a clean copy without __proto__, constructor, or prototype properties
 * @param obj - Potentially dangerous object
 * @returns Safe object copy
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  if (!obj || typeof obj !== 'object') {
    return {} as T;
  }

  // Parse through JSON to remove functions and break prototype chain
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return {} as T;
  }
}

/**
 * Check if a key is potentially dangerous (prototype pollution)
 * @param key - Object key to check
 * @returns True if key is dangerous
 */
export function isDangerousKey(key: string): boolean {
  const dangerousKeys = [
    '__proto__',
    'prototype',
    'constructor',
    '__defineGetter__',
    '__defineSetter__',
    '__lookupGetter__',
    '__lookupSetter__',
  ];

  return dangerousKeys.includes(key) || key.startsWith('$');
}

/**
 * Deeply sanitize a metadata object
 * Removes dangerous keys and sanitizes string values
 * @param metadata - User-provided metadata object
 * @returns Sanitized metadata
 */
export function sanitizeMetadata(
  metadata: Record<string, unknown>
): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object') {
    return {};
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    // Skip dangerous keys
    if (isDangerousKey(key)) {
      continue;
    }

    // Recursively handle nested objects
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = sanitizeMetadata(value as Record<string, unknown>);
    }
    // Sanitize string values
    else if (typeof value === 'string') {
      result[key] = sanitizeText(value);
    }
    // Handle arrays
    else if (Array.isArray(value)) {
      result[key] = value.map((item) => {
        if (typeof item === 'string') {
          return sanitizeText(item);
        }
        if (item !== null && typeof item === 'object') {
          return sanitizeMetadata(item as Record<string, unknown>);
        }
        return item;
      });
    }
    // Keep other primitives as-is
    else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Sanitize a URL - validates and sanitizes URL strings
 * @param url - Potentially unsafe URL
 * @returns Safe URL or empty string if invalid
 */
export function sanitizeUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    return '';
  }

  try {
    const parsed = new URL(url);

    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return '';
    }

    return parsed.href;
  } catch {
    return '';
  }
}

/**
 * Sanitize an email address
 * @param email - Potentially unsafe email
 * @returns Sanitized email or empty string if invalid
 */
export function sanitizeEmail(email: string): string {
  if (!email || typeof email !== 'string') {
    return '';
  }

  // Basic email validation and sanitization
  const sanitized = email.trim().toLowerCase();

  // RFC 5322 simplified email regex
  const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

  if (!emailRegex.test(sanitized)) {
    return '';
  }

  return sanitized;
}

/**
 * Create a Zod transform for sanitizing strings
 * Use in schema definitions: z.string().transform(sanitizeTransform)
 */
export function sanitizeTransform(val: string): string {
  return sanitizeText(val);
}

/**
 * Create a Zod transform for sanitizing metadata objects
 * Use in schema definitions: z.record(z.unknown()).transform(metadataTransform)
 */
export function metadataTransform(val: Record<string, unknown>): Record<string, unknown> {
  return sanitizeMetadata(val);
}
