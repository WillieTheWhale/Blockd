/**
 * Email Service
 * Blockd Auth Service
 *
 * Production-ready email service with multiple provider support:
 * - SendGrid (recommended for production)
 * - SMTP (generic SMTP server)
 * - Console (development/testing - logs to console)
 */

import { config } from '../src/config';

// ============================================================================
// Types
// ============================================================================

export interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export interface VerificationEmailData {
  email: string;
  name?: string;
  verificationUrl: string;
  token: string;
}

export interface PasswordResetEmailData {
  email: string;
  name?: string;
  resetUrl: string;
  token: string;
}

export interface MFASetupEmailData {
  email: string;
  name?: string;
}

export interface LoginAlertEmailData {
  email: string;
  name?: string;
  loginTime: Date;
  ipAddress?: string;
  location?: string;
  userAgent?: string;
}

export interface SecurityAlertEmailData {
  email: string;
  name?: string;
  sessionId: string;
  eventType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  timestamp: Date;
  intervieweeName?: string;
}

// ============================================================================
// Email Provider Interface
// ============================================================================

interface EmailProvider {
  send(options: EmailOptions): Promise<void>;
}

// ============================================================================
// SendGrid Provider
// ============================================================================

class SendGridProvider implements EmailProvider {
  private apiKey: string;
  private fromEmail: string;
  private fromName: string;

  constructor() {
    this.apiKey = config.email.sendgrid.apiKey;
    this.fromEmail = config.email.from;
    this.fromName = config.email.fromName;
  }

  async send(options: EmailOptions): Promise<void> {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: options.to }] }],
        from: { email: this.fromEmail, name: this.fromName },
        subject: options.subject,
        content: [
          ...(options.text ? [{ type: 'text/plain', value: options.text }] : []),
          ...(options.html ? [{ type: 'text/html', value: options.html }] : []),
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`SendGrid API error: ${response.status} - ${error}`);
    }
  }
}

// ============================================================================
// SMTP Provider (using nodemailer-compatible fetch-based implementation)
// ============================================================================

class SMTPProvider implements EmailProvider {
  private host: string;
  private port: number;
  private secure: boolean;
  private user: string;
  private password: string;
  private fromEmail: string;
  private fromName: string;

  constructor() {
    this.host = config.email.smtp.host;
    this.port = config.email.smtp.port;
    this.secure = config.email.smtp.secure;
    this.user = config.email.smtp.user;
    this.password = config.email.smtp.password;
    this.fromEmail = config.email.from;
    this.fromName = config.email.fromName;
  }

  async send(options: EmailOptions): Promise<void> {
    // Dynamic import nodemailer to avoid bundling issues
    const nodemailer = await import('nodemailer');

    const transporter = nodemailer.createTransport({
      host: this.host,
      port: this.port,
      secure: this.secure,
      auth: {
        user: this.user,
        pass: this.password,
      },
    });

    await transporter.sendMail({
      from: `"${this.fromName}" <${this.fromEmail}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
  }
}

// ============================================================================
// Console Provider (Development/Testing)
// ============================================================================

class ConsoleProvider implements EmailProvider {
  async send(options: EmailOptions): Promise<void> {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📧 EMAIL (Console Provider - Development Mode)');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`To:      ${options.to}`);
    console.log(`Subject: ${options.subject}`);
    console.log('───────────────────────────────────────────────────────────────');
    console.log(options.text || '[HTML content - see html field]');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
  }
}

// ============================================================================
// Email Service Singleton
// ============================================================================

let emailProvider: EmailProvider | null = null;

function getProvider(): EmailProvider {
  if (emailProvider) return emailProvider;

  switch (config.email.provider) {
    case 'sendgrid':
      emailProvider = new SendGridProvider();
      break;
    case 'smtp':
      emailProvider = new SMTPProvider();
      break;
    case 'console':
    default:
      emailProvider = new ConsoleProvider();
      break;
  }

  return emailProvider;
}

// ============================================================================
// HTML Email Templates
// ============================================================================

function wrapHtmlTemplate(content: string, title: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background-color: #ffffff;
      border-radius: 8px;
      padding: 40px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .logo {
      font-size: 28px;
      font-weight: bold;
      color: #2563eb;
    }
    h1 {
      color: #1a1a1a;
      font-size: 24px;
      margin-bottom: 20px;
    }
    .button {
      display: inline-block;
      background-color: #2563eb;
      color: #ffffff !important;
      text-decoration: none;
      padding: 14px 28px;
      border-radius: 6px;
      font-weight: 600;
      margin: 20px 0;
    }
    .button:hover {
      background-color: #1d4ed8;
    }
    .code {
      background-color: #f3f4f6;
      padding: 12px 20px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 18px;
      letter-spacing: 2px;
      display: inline-block;
      margin: 10px 0;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e5e5;
      text-align: center;
      color: #666;
      font-size: 14px;
    }
    .warning {
      background-color: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 12px 16px;
      margin: 20px 0;
      border-radius: 0 6px 6px 0;
    }
    .critical {
      background-color: #fee2e2;
      border-left: 4px solid #ef4444;
      padding: 12px 16px;
      margin: 20px 0;
      border-radius: 0 6px 6px 0;
    }
    .info-box {
      background-color: #f3f4f6;
      padding: 16px;
      border-radius: 6px;
      margin: 20px 0;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #e5e5e5;
    }
    .info-row:last-child {
      border-bottom: none;
    }
    .label {
      color: #666;
      font-weight: 500;
    }
    .value {
      color: #1a1a1a;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">Blockd</div>
    </div>
    ${content}
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} Blockd. All rights reserved.</p>
      <p>This is an automated message. Please do not reply directly to this email.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

// ============================================================================
// Public Email Functions
// ============================================================================

/**
 * Send a generic email
 */
export async function sendEmail(options: EmailOptions): Promise<void> {
  if (!config.email.enabled) {
    console.log(`[EMAIL DISABLED] Would send to ${options.to}: ${options.subject}`);
    return;
  }

  const provider = getProvider();

  try {
    await provider.send(options);
  } catch (error) {
    console.error('Failed to send email:', error);
    // In production, you might want to queue failed emails for retry
    throw error;
  }
}

/**
 * Send email verification
 */
export async function sendVerificationEmail(data: VerificationEmailData): Promise<void> {
  const subject = 'Verify your Blockd account';

  const text = `
Hello ${data.name || 'there'},

Thank you for registering with Blockd!

Please verify your email address by clicking the link below:
${data.verificationUrl}

Or use this verification code: ${data.token}

This link will expire in 24 hours.

If you didn't create this account, please ignore this email.

Best regards,
The Blockd Team
  `.trim();

  const html = wrapHtmlTemplate(`
    <h1>Verify Your Email</h1>
    <p>Hello ${data.name || 'there'},</p>
    <p>Thank you for registering with Blockd! Please verify your email address to get started.</p>
    <div style="text-align: center;">
      <a href="${data.verificationUrl}" class="button">Verify Email Address</a>
    </div>
    <p>Or use this verification code:</p>
    <div style="text-align: center;">
      <span class="code">${data.token}</span>
    </div>
    <p style="color: #666; font-size: 14px;">This link will expire in 24 hours.</p>
    <div class="warning">
      <strong>Didn't create this account?</strong> You can safely ignore this email.
    </div>
  `, subject);

  await sendEmail({ to: data.email, subject, text, html });
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(data: PasswordResetEmailData): Promise<void> {
  const subject = 'Reset your Blockd password';

  const text = `
Hello ${data.name || 'there'},

We received a request to reset your Blockd password.

Click the link below to reset your password:
${data.resetUrl}

Or use this reset code: ${data.token}

This link will expire in 1 hour.

If you didn't request this, please ignore this email and your password will remain unchanged.

Best regards,
The Blockd Team
  `.trim();

  const html = wrapHtmlTemplate(`
    <h1>Reset Your Password</h1>
    <p>Hello ${data.name || 'there'},</p>
    <p>We received a request to reset your Blockd password.</p>
    <div style="text-align: center;">
      <a href="${data.resetUrl}" class="button">Reset Password</a>
    </div>
    <p>Or use this reset code:</p>
    <div style="text-align: center;">
      <span class="code">${data.token}</span>
    </div>
    <p style="color: #666; font-size: 14px;">This link will expire in 1 hour.</p>
    <div class="warning">
      <strong>Didn't request this?</strong> You can safely ignore this email and your password will remain unchanged.
    </div>
  `, subject);

  await sendEmail({ to: data.email, subject, text, html });
}

/**
 * Send MFA setup confirmation email
 */
export async function sendMFASetupEmail(data: MFASetupEmailData): Promise<void> {
  const subject = 'Two-factor authentication enabled';

  const text = `
Hello ${data.name || 'there'},

Two-factor authentication has been successfully enabled on your Blockd account.

Your account is now more secure. You'll need to enter a verification code from your authenticator app each time you log in.

If you didn't enable this feature, please contact support immediately.

Best regards,
The Blockd Team
  `.trim();

  const html = wrapHtmlTemplate(`
    <h1>2FA Enabled Successfully</h1>
    <p>Hello ${data.name || 'there'},</p>
    <p>Two-factor authentication has been successfully enabled on your Blockd account.</p>
    <div class="info-box">
      <p><strong>What this means:</strong></p>
      <ul>
        <li>Your account is now more secure</li>
        <li>You'll need your authenticator app to log in</li>
        <li>Keep your backup codes in a safe place</li>
      </ul>
    </div>
    <div class="critical">
      <strong>Didn't enable this?</strong> Contact support immediately at support@blockd.io
    </div>
  `, subject);

  await sendEmail({ to: data.email, subject, text, html });
}

/**
 * Send login alert email
 */
export async function sendLoginAlertEmail(data: LoginAlertEmailData): Promise<void> {
  const subject = 'New login to your Blockd account';
  const location = data.location || 'Unknown location';
  const ip = data.ipAddress || 'Unknown IP';
  const time = data.loginTime.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  const text = `
Hello ${data.name || 'there'},

We detected a new login to your Blockd account:

Time: ${time}
IP Address: ${ip}
Location: ${location}

If this was you, you can safely ignore this email.

If you don't recognize this activity, please secure your account immediately by:
1. Changing your password
2. Enabling two-factor authentication
3. Reviewing your account activity

Best regards,
The Blockd Team
  `.trim();

  const html = wrapHtmlTemplate(`
    <h1>New Login Detected</h1>
    <p>Hello ${data.name || 'there'},</p>
    <p>We detected a new login to your Blockd account:</p>
    <div class="info-box">
      <div class="info-row">
        <span class="label">Time</span>
        <span class="value">${time}</span>
      </div>
      <div class="info-row">
        <span class="label">IP Address</span>
        <span class="value">${ip}</span>
      </div>
      <div class="info-row">
        <span class="label">Location</span>
        <span class="value">${location}</span>
      </div>
      ${data.userAgent ? `
      <div class="info-row">
        <span class="label">Device</span>
        <span class="value">${data.userAgent.substring(0, 50)}...</span>
      </div>
      ` : ''}
    </div>
    <p><strong>Was this you?</strong> You can safely ignore this email.</p>
    <div class="warning">
      <strong>Don't recognize this activity?</strong> Secure your account immediately:
      <ol>
        <li>Change your password</li>
        <li>Enable two-factor authentication</li>
        <li>Review your account activity</li>
      </ol>
    </div>
  `, subject);

  await sendEmail({ to: data.email, subject, text, html });
}

/**
 * Send welcome email after successful registration
 */
export async function sendWelcomeEmail(email: string, name?: string): Promise<void> {
  const subject = 'Welcome to Blockd!';

  const text = `
Hello ${name || 'there'},

Welcome to Blockd - the intelligent interview integrity platform!

We're excited to have you on board. Here's what you can do next:

1. Complete your profile
2. Set up two-factor authentication for extra security
3. Explore the platform features

If you have any questions, our support team is here to help.

Best regards,
The Blockd Team
  `.trim();

  const html = wrapHtmlTemplate(`
    <h1>Welcome to Blockd!</h1>
    <p>Hello ${name || 'there'},</p>
    <p>We're excited to have you on board. Blockd is the intelligent interview integrity platform that helps you conduct fair and secure interviews.</p>
    <div class="info-box">
      <p><strong>Get started:</strong></p>
      <ol>
        <li>Complete your profile</li>
        <li>Set up two-factor authentication for extra security</li>
        <li>Explore the platform features</li>
      </ol>
    </div>
    <div style="text-align: center;">
      <a href="${config.frontendUrl}/dashboard" class="button">Go to Dashboard</a>
    </div>
    <p>If you have any questions, our support team is here to help at <a href="mailto:support@blockd.io">support@blockd.io</a>.</p>
  `, subject);

  await sendEmail({ to: email, subject, text, html });
}

/**
 * Send security alert email to interviewer
 * Used when critical security events occur during an interview
 */
export async function sendSecurityAlertEmail(data: SecurityAlertEmailData): Promise<void> {
  const severityColors = {
    low: '#3b82f6',
    medium: '#f59e0b',
    high: '#ef4444',
    critical: '#dc2626',
  };

  const severityLabels = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    critical: 'CRITICAL',
  };

  const subject = `[${severityLabels[data.severity]}] Security Alert - Interview Session`;
  const time = data.timestamp.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const text = `
SECURITY ALERT - ${severityLabels[data.severity]}

Hello ${data.name || 'Interviewer'},

A security event has been detected during interview session ${data.sessionId}:

Event Type: ${data.eventType}
Severity: ${severityLabels[data.severity]}
Time: ${time}
${data.intervieweeName ? `Interviewee: ${data.intervieweeName}` : ''}

Description:
${data.description}

Please review this session in the Blockd dashboard for more details.

Best regards,
The Blockd Security System
  `.trim();

  const html = wrapHtmlTemplate(`
    <div class="${data.severity === 'critical' || data.severity === 'high' ? 'critical' : 'warning'}">
      <h1 style="margin: 0; color: ${severityColors[data.severity]};">
        Security Alert - ${severityLabels[data.severity]}
      </h1>
    </div>
    <p>Hello ${data.name || 'Interviewer'},</p>
    <p>A security event has been detected during an active interview session:</p>
    <div class="info-box">
      <div class="info-row">
        <span class="label">Session ID</span>
        <span class="value">${data.sessionId.substring(0, 8)}...</span>
      </div>
      ${data.intervieweeName ? `
      <div class="info-row">
        <span class="label">Interviewee</span>
        <span class="value">${data.intervieweeName}</span>
      </div>
      ` : ''}
      <div class="info-row">
        <span class="label">Event Type</span>
        <span class="value">${data.eventType.replace(/_/g, ' ')}</span>
      </div>
      <div class="info-row">
        <span class="label">Severity</span>
        <span class="value" style="color: ${severityColors[data.severity]};">${severityLabels[data.severity]}</span>
      </div>
      <div class="info-row">
        <span class="label">Time</span>
        <span class="value">${time}</span>
      </div>
    </div>
    <p><strong>Description:</strong></p>
    <p>${data.description}</p>
    <div style="text-align: center;">
      <a href="${config.frontendUrl}/sessions/${data.sessionId}" class="button">View Session Details</a>
    </div>
  `, subject);

  await sendEmail({ to: data.email, subject, text, html });
}
