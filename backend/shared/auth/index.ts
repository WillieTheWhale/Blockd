/**
 * Shared Authentication Module
 *
 * Provides centralized JWT handling and token management for all Blockd services.
 */

// JWT Service exports
export {
  // Types
  JWTPayload,
  MFAPayload,
  TokenPair,
  JWTConfig,
  // Errors
  JWTError,
  TokenExpiredError,
  InvalidTokenError,
  TokenRevokedError,
  // Functions
  getJWTConfig,
  resetConfig,
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
  generateMFAToken,
  verifyAccessToken,
  verifyRefreshToken,
  verifyMFAToken,
  decodeToken,
  isTokenExpired,
  getTokenExpiration,
  getTokenTTL,
  extractTokenFromHeader,
  getUserIdFromToken,
  validateTokenStructure,
  getPublicKey,
  getAccessTokenTTL,
  getRefreshTokenTTL,
} from './jwt-service';

// Token Revocation exports
export {
  RevokeOptions,
  RevocationRecord,
  revokeToken,
  isTokenRevoked,
  getRevocationRecord,
  revokeAllUserTokens,
  registerUserToken,
  getActiveTokenCount,
  createTokenFamily,
  rotateTokenFamily,
  revokeTokenFamily,
  isTokenFamilyValid,
} from './token-revocation';
