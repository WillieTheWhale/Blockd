/**
 * Authentication Types
 * Blockd Auth Service
 */

export interface RegisterRequest {
  email: string;
  password: string;
  full_name: string;
  role: 'interviewer' | 'interviewee';
  organization_id?: string;
}

export interface RegisterResponse {
  user_id: string;
  email: string;
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface LoginRequest {
  email: string;
  password: string;
  mfa_code?: string;
}

export interface LoginResponse {
  user_id: string;
  email: string;
  access_token: string;
  refresh_token: string;
  expires_in: number;
  requires_mfa?: boolean;
  mfa_token?: string; // Temporary token for MFA verification
}

export interface RefreshTokenRequest {
  refresh_token: string;
}

export interface RefreshTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirm {
  reset_token: string;
  new_password: string;
}

export interface EmailVerificationRequest {
  token: string;
}

export interface PasswordChangeRequest {
  old_password: string;
  new_password: string;
}

export interface RevokeTokenRequest {
  refresh_token: string;
}

export interface OAuthCallbackQuery {
  code: string;
  state: string;
}

export interface OAuthUserInfo {
  email: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  provider: 'google' | 'microsoft';
}

export interface LoginAttempt {
  email: string;
  timestamp: number;
  success: boolean;
  ip_address?: string;
}

export interface RateLimitInfo {
  attempts: number;
  locked_until?: number;
}
