/**
 * Email Service (Stub Implementation)
 * Blockd Auth Service
 *
 * NOTE: This is a stub implementation that logs to console.
 * In production, integrate with SendGrid, AWS SES, or similar service.
 */

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
}

/**
 * Send a generic email (stub)
 */
export async function sendEmail(options: EmailOptions): Promise<void> {
  console.log('📧 [EMAIL STUB] Sending email:');
  console.log(`   To: ${options.to}`);
  console.log(`   Subject: ${options.subject}`);
  console.log(`   Body: ${options.text || options.html}`);
  console.log('');

  // In production, use a real email service:
  // await emailProvider.send(options);
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

  await sendEmail({
    to: data.email,
    subject,
    text
  });
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

  await sendEmail({
    to: data.email,
    subject,
    text
  });
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

  await sendEmail({
    to: data.email,
    subject,
    text
  });
}

/**
 * Send login alert email
 */
export async function sendLoginAlertEmail(data: LoginAlertEmailData): Promise<void> {
  const subject = 'New login to your Blockd account';
  const location = data.location || 'Unknown location';
  const ip = data.ipAddress || 'Unknown IP';

  const text = `
Hello ${data.name || 'there'},

We detected a new login to your Blockd account:

Time: ${data.loginTime.toLocaleString()}
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

  await sendEmail({
    to: data.email,
    subject,
    text
  });
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

  await sendEmail({
    to: email,
    subject,
    text
  });
}
