/**
 * Fastify type extensions for plugins and custom properties
 */

import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';

// Extend FastifyReply with cookie methods from @fastify/cookie
declare module 'fastify' {
  interface FastifyReply {
    setCookie(
      name: string,
      value: string,
      options?: {
        domain?: string;
        expires?: Date;
        httpOnly?: boolean;
        maxAge?: number;
        path?: string;
        sameSite?: 'strict' | 'lax' | 'none' | boolean;
        secure?: boolean;
        signed?: boolean;
      }
    ): FastifyReply;

    clearCookie(
      name: string,
      options?: {
        domain?: string;
        path?: string;
        sameSite?: 'strict' | 'lax' | 'none' | boolean;
        secure?: boolean;
      }
    ): FastifyReply;
  }

  interface FastifyRequest {
    cookies: Record<string, string>;
    unsignCookie(value: string): {
      valid: boolean;
      renew: boolean;
      value: string | null;
    };
  }
}
