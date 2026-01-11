/**
 * MFA Setup Confirmation Template
 * Blockd Auth Service
 */

import { baseTemplate, escapeHtml } from './base.html';
import type { EmailTemplate, MFASetupEmailData } from '../email.types';

/**
 * Generate MFA setup confirmation email template
 */
export function mfaSetupEmailTemplate(data: MFASetupEmailData): EmailTemplate {
  const name = escapeHtml(data.name || 'there');

  const html = baseTemplate(`
    <h1>Two-Factor Authentication Enabled</h1>

    <p>Hello ${name},</p>

    <p>Great news! Two-factor authentication (2FA) has been successfully enabled on your Blockd account.</p>

    <div class="info-box">
      <p><strong>What this means:</strong> Your account is now protected with an extra layer of security. Each time you log in, you'll need to enter a verification code from your authenticator app.</p>
    </div>

    <p>Here are some important tips to keep your account secure:</p>

    <ul style="color: #3f3f46; margin: 16px 0; padding-left: 24px;">
      <li style="margin-bottom: 8px;">Keep your recovery codes in a safe place</li>
      <li style="margin-bottom: 8px;">Don't share your authenticator codes with anyone</li>
      <li style="margin-bottom: 8px;">If you lose access to your authenticator, use a recovery code to log in</li>
    </ul>

    <div class="warning-box">
      <p><strong>Didn't enable 2FA?</strong> If you didn't make this change, please contact our support team immediately and change your password.</p>
    </div>

    <p class="text-muted">Thank you for taking steps to secure your account!</p>
  `);

  const text = `
Hello ${data.name || 'there'},

Two-factor authentication has been successfully enabled on your Blockd account.

Your account is now more secure. You'll need to enter a verification code from your authenticator app each time you log in.

Important tips:
- Keep your recovery codes in a safe place
- Don't share your authenticator codes with anyone
- If you lose access to your authenticator, use a recovery code to log in

If you didn't enable this feature, please contact support immediately and change your password.

Best regards,
The Blockd Team

---
Blockd - AI-Powered Interview Security
https://blockd.io
  `.trim();

  return {
    subject: 'Two-factor authentication enabled on your Blockd account',
    html,
    text,
  };
}
