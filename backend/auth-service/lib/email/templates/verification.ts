/**
 * Email Verification Template
 * Blockd Auth Service
 */

import { baseTemplate, escapeHtml, escapeUrl } from './base.html';
import type { EmailTemplate, VerificationEmailData } from '../email.types';

/**
 * Generate email verification template
 */
export function verificationEmailTemplate(data: VerificationEmailData): EmailTemplate {
  const name = escapeHtml(data.name || 'there');
  const verificationUrl = escapeUrl(data.verificationUrl);
  const token = escapeHtml(data.token);

  const html = baseTemplate(`
    <h1>Verify Your Email Address</h1>

    <p>Hello ${name},</p>

    <p>Thank you for registering with Blockd! To complete your registration and access all features, please verify your email address.</p>

    <div class="button-container">
      <a href="${verificationUrl}" class="button">Verify Email Address</a>
    </div>

    <p class="text-muted text-small">If the button doesn't work, copy and paste this link into your browser:</p>
    <p class="text-small" style="word-break: break-all;">${verificationUrl}</p>

    <div class="code-block">
      <p class="text-muted text-small" style="margin-bottom: 8px;">Or enter this verification code:</p>
      <span class="code">${token}</span>
    </div>

    <div class="info-box">
      <p>This verification link will expire in 24 hours.</p>
    </div>

    <p class="text-muted">If you didn't create a Blockd account, you can safely ignore this email.</p>
  `);

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

---
Blockd - AI-Powered Interview Security
https://blockd.io
  `.trim();

  return {
    subject: 'Verify your Blockd account',
    html,
    text,
  };
}
