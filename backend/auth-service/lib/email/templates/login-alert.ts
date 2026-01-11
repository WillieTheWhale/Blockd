/**
 * Login Alert Template
 * Blockd Auth Service
 */

import { baseTemplate, escapeHtml } from './base.html';
import type { EmailTemplate, LoginAlertEmailData } from '../email.types';

/**
 * Generate login alert email template
 */
export function loginAlertEmailTemplate(data: LoginAlertEmailData): EmailTemplate {
  const name = escapeHtml(data.name || 'there');
  const loginTime = data.loginTime.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  const ipAddress = escapeHtml(data.ipAddress || 'Unknown');
  const location = escapeHtml(data.location || 'Unknown location');

  const html = baseTemplate(`
    <h1>New Login Detected</h1>

    <p>Hello ${name},</p>

    <p>We detected a new login to your Blockd account. Here are the details:</p>

    <table role="presentation" style="width: 100%; margin: 24px 0; border-collapse: collapse;">
      <tr>
        <td style="padding: 12px 16px; background-color: #f4f4f5; border-bottom: 1px solid #e4e4e7; font-weight: 600; width: 120px;">Time</td>
        <td style="padding: 12px 16px; background-color: #f4f4f5; border-bottom: 1px solid #e4e4e7;">${loginTime}</td>
      </tr>
      <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e4e4e7; font-weight: 600;">IP Address</td>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e4e4e7; font-family: monospace;">${ipAddress}</td>
      </tr>
      <tr>
        <td style="padding: 12px 16px; font-weight: 600;">Location</td>
        <td style="padding: 12px 16px;">${location}</td>
      </tr>
    </table>

    <div class="info-box">
      <p>If this was you, no action is needed. You can safely ignore this email.</p>
    </div>

    <div class="warning-box">
      <p><strong>Didn't recognize this login?</strong> If this wasn't you, we recommend taking these steps immediately:</p>
    </div>

    <ol style="color: #3f3f46; margin: 16px 0; padding-left: 24px;">
      <li style="margin-bottom: 8px;">Change your password</li>
      <li style="margin-bottom: 8px;">Enable two-factor authentication if not already enabled</li>
      <li style="margin-bottom: 8px;">Review your recent account activity</li>
      <li style="margin-bottom: 8px;">Sign out of all sessions from your security settings</li>
    </ol>

    <p class="text-muted">We take your security seriously. If you have any concerns, please contact our support team.</p>
  `);

  const text = `
Hello ${data.name || 'there'},

We detected a new login to your Blockd account:

Time: ${loginTime}
IP Address: ${ipAddress}
Location: ${location}

If this was you, you can safely ignore this email.

If you don't recognize this activity, please secure your account immediately by:
1. Changing your password
2. Enabling two-factor authentication
3. Reviewing your account activity
4. Signing out of all sessions

Best regards,
The Blockd Team

---
Blockd - AI-Powered Interview Security
https://blockd.io
  `.trim();

  return {
    subject: 'New login to your Blockd account',
    html,
    text,
  };
}
