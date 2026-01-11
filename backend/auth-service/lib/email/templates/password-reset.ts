/**
 * Password Reset Template
 * Blockd Auth Service
 */

import { baseTemplate, escapeHtml, escapeUrl } from './base.html';
import type { EmailTemplate, PasswordResetEmailData } from '../email.types';

/**
 * Generate password reset email template
 */
export function passwordResetEmailTemplate(data: PasswordResetEmailData): EmailTemplate {
  const name = escapeHtml(data.name || 'there');
  const resetUrl = escapeUrl(data.resetUrl);
  const token = escapeHtml(data.token);

  const html = baseTemplate(`
    <h1>Reset Your Password</h1>

    <p>Hello ${name},</p>

    <p>We received a request to reset the password for your Blockd account. Click the button below to create a new password.</p>

    <div class="button-container">
      <a href="${resetUrl}" class="button">Reset Password</a>
    </div>

    <p class="text-muted text-small">If the button doesn't work, copy and paste this link into your browser:</p>
    <p class="text-small" style="word-break: break-all;">${resetUrl}</p>

    <div class="code-block">
      <p class="text-muted text-small" style="margin-bottom: 8px;">Or enter this reset code:</p>
      <span class="code">${token}</span>
    </div>

    <div class="warning-box">
      <p><strong>Important:</strong> This link will expire in 1 hour for security reasons.</p>
    </div>

    <p class="text-muted">If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
  `);

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

---
Blockd - AI-Powered Interview Security
https://blockd.io
  `.trim();

  return {
    subject: 'Reset your Blockd password',
    html,
    text,
  };
}
