/**
 * Email Module
 * Blockd Auth Service
 *
 * Provides email sending functionality with AWS SES integration
 * and professional HTML templates.
 *
 * Usage:
 *   import { sendVerificationEmail, sendPasswordResetEmail } from './email';
 */

import { config } from '../../src/config';
import { createTransport } from './email.transport';
import { EmailService } from './email.service';
import type {
  VerificationEmailData,
  PasswordResetEmailData,
  MFASetupEmailData,
  LoginAlertEmailData,
  WelcomeEmailData,
  EmailOptions,
  EmailResult,
} from './email.types';

// Create singleton email service instance
const transport = createTransport({
  enabled: config.email.enabled,
  region: config.email.aws.region,
  accessKeyId: config.email.aws.accessKeyId,
  secretAccessKey: config.email.aws.secretAccessKey,
  from: config.email.from,
});

const emailService = new EmailService(transport, config.email.from);

/**
 * Send email verification email
 */
export async function sendVerificationEmail(data: VerificationEmailData): Promise<void> {
  return emailService.sendVerificationEmail(data);
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(data: PasswordResetEmailData): Promise<void> {
  return emailService.sendPasswordResetEmail(data);
}

/**
 * Send MFA setup confirmation email
 */
export async function sendMFASetupEmail(data: MFASetupEmailData): Promise<void> {
  return emailService.sendMFASetupEmail(data);
}

/**
 * Send login alert email
 */
export async function sendLoginAlertEmail(data: LoginAlertEmailData): Promise<void> {
  return emailService.sendLoginAlertEmail(data);
}

/**
 * Send welcome email after successful registration
 *
 * @param email - Recipient email address
 * @param name - Optional recipient name
 */
export async function sendWelcomeEmail(email: string, name?: string): Promise<void> {
  return emailService.sendWelcomeEmail({ email, name });
}

/**
 * Generic email send function (for custom emails)
 */
export async function sendEmail(options: EmailOptions): Promise<void> {
  const result = await transport.send(options);
  if (!result.success) {
    console.warn(`[Email] Send failed for ${options.to}: ${result.error}`);
  }
}

// Re-export types for external use
export type {
  VerificationEmailData,
  PasswordResetEmailData,
  MFASetupEmailData,
  LoginAlertEmailData,
  WelcomeEmailData,
  EmailOptions,
  EmailResult,
};

// Re-export classes for advanced usage
export { EmailService } from './email.service';
export { SESTransport, ConsoleTransport, createTransport } from './email.transport';
