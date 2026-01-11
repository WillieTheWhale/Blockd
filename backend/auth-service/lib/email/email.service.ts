/**
 * Email Service
 * Blockd Auth Service
 *
 * Orchestrates email sending with templates and transport
 */

import type {
  EmailTransport,
  VerificationEmailData,
  PasswordResetEmailData,
  MFASetupEmailData,
  LoginAlertEmailData,
  WelcomeEmailData,
} from './email.types';
import { verificationEmailTemplate } from './templates/verification';
import { passwordResetEmailTemplate } from './templates/password-reset';
import { mfaSetupEmailTemplate } from './templates/mfa-setup';
import { loginAlertEmailTemplate } from './templates/login-alert';
import { welcomeEmailTemplate } from './templates/welcome';

/**
 * Email service that handles all email operations
 */
export class EmailService {
  private transport: EmailTransport;
  private defaultFrom: string;

  constructor(transport: EmailTransport, defaultFrom: string = 'noreply@blockd.io') {
    this.transport = transport;
    this.defaultFrom = defaultFrom;
  }

  /**
   * Send email verification email
   */
  async sendVerificationEmail(data: VerificationEmailData): Promise<void> {
    const template = verificationEmailTemplate(data);

    const result = await this.transport.send({
      to: data.email,
      from: this.defaultFrom,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    if (!result.success) {
      console.warn(`[EmailService] Verification email failed for ${data.email}: ${result.error}`);
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(data: PasswordResetEmailData): Promise<void> {
    const template = passwordResetEmailTemplate(data);

    const result = await this.transport.send({
      to: data.email,
      from: this.defaultFrom,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    if (!result.success) {
      console.warn(`[EmailService] Password reset email failed for ${data.email}: ${result.error}`);
    }
  }

  /**
   * Send MFA setup confirmation email
   */
  async sendMFASetupEmail(data: MFASetupEmailData): Promise<void> {
    const template = mfaSetupEmailTemplate(data);

    const result = await this.transport.send({
      to: data.email,
      from: this.defaultFrom,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    if (!result.success) {
      console.warn(`[EmailService] MFA setup email failed for ${data.email}: ${result.error}`);
    }
  }

  /**
   * Send login alert email
   */
  async sendLoginAlertEmail(data: LoginAlertEmailData): Promise<void> {
    const template = loginAlertEmailTemplate(data);

    const result = await this.transport.send({
      to: data.email,
      from: this.defaultFrom,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    if (!result.success) {
      console.warn(`[EmailService] Login alert email failed for ${data.email}: ${result.error}`);
    }
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(data: WelcomeEmailData): Promise<void> {
    const template = welcomeEmailTemplate(data);

    const result = await this.transport.send({
      to: data.email,
      from: this.defaultFrom,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    if (!result.success) {
      console.warn(`[EmailService] Welcome email failed for ${data.email}: ${result.error}`);
    }
  }
}
