/**
 * Global TypeScript declarations for build-time constants
 *
 * These constants are replaced at build time by the bundler (esbuild/webpack).
 * This prevents runtime bypass of security checks.
 */

/**
 * Build-time constant for development mode.
 * Replaced at build time - cannot be bypassed at runtime.
 * Set to true only in development builds.
 */
declare const __BLOCKD_DEV_MODE__: boolean;
