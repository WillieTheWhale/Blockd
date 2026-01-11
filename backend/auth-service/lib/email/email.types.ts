/**
 * Email Service Types
 * Blockd Auth Service
 */

/**
 * Email transport options for sending emails
 */
export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string;
}

/**
 * Result of an email send operation
 */
export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Email transport interface for different providers
 */
export interface EmailTransport {
  send(options: EmailOptions): Promise<EmailResult>;
}

/**
 * Generated email template with subject, HTML, and plain text
 */
export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

/**
 * Data for sending email verification emails
 */
export interface VerificationEmailData {
  email: string;
  name?: string;
  verificationUrl: string;
  token: string;
}

/**
 * Data for sending password reset emails
 */
export interface PasswordResetEmailData {
  email: string;
  name?: string;
  resetUrl: string;
  token: string;
}

/**
 * Data for sending MFA setup confirmation emails
 */
export interface MFASetupEmailData {
  email: string;
  name?: string;
}

/**
 * Data for sending login alert emails
 */
export interface LoginAlertEmailData {
  email: string;
  name?: string;
  loginTime: Date;
  ipAddress?: string;
  location?: string;
}

/**
 * Data for sending welcome emails
 */
export interface WelcomeEmailData {
  email: string;
  name?: string;
}

/**
 * AWS SES transport configuration
 */
export interface SESTransportConfig {
  enabled: boolean;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  from: string;
}
