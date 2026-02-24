/**
 * JWT Types
 * Blockd Auth Service
 */

export interface JWTPayload {
  sub: string;           // user_id
  email: string;
  role: 'admin' | 'interviewer' | 'interviewee';
  organization_id: string | null;
  iat: number;           // issued at
  exp: number;           // expiration
  iss: string;           // issuer
  aud: string;           // audience
  mfa_verified?: boolean; // true if MFA was verified during login
}

export interface JWTOptions {
  expiresIn: string | number;
  algorithm?: 'RS256' | 'HS256';
  issuer?: string;
  audience?: string;
}

export interface DecodedToken {
  payload: JWTPayload;
  header: {
    alg: string;
    typ: string;
  };
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface RefreshTokenData {
  user_id: string;
  token: string;
  created_at: number;
  expires_at: number;
  ip_address?: string;
  user_agent?: string;
}
