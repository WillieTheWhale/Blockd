/**
 * User Types
 * Blockd Auth Service
 */

export type UserRole = 'admin' | 'interviewer' | 'interviewee';

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  organization_id: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  mfa_enabled: boolean;
  email_verified: boolean;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserData {
  email: string;
  password_hash: string;
  role: UserRole;
  organization_id?: string;
  first_name?: string;
  last_name?: string;
}

export interface UpdateUserData {
  first_name?: string;
  last_name?: string;
  email?: string;
  role?: UserRole;
  organization_id?: string;
}

export interface UserWithPassword extends UserProfile {
  password_hash: string;
  mfa_secret?: string | null;
}

export interface UserSession {
  user_id: string;
  email: string;
  role: UserRole;
  organization_id: string | null;
  session_id: string;
  created_at: number;
  expires_at: number;
  ip_address?: string;
  user_agent?: string;
}

export interface BackupCode {
  code: string;
  used: boolean;
  used_at?: Date;
}

export interface MFASecret {
  secret: string;
  backup_codes: BackupCode[];
  enabled_at: Date;
}
