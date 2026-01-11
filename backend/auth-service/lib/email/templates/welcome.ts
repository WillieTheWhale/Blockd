/**
 * Welcome Email Template
 * Blockd Auth Service
 */

import { baseTemplate, escapeHtml } from './base.html';
import type { EmailTemplate, WelcomeEmailData } from '../email.types';

/**
 * Generate welcome email template
 */
export function welcomeEmailTemplate(data: WelcomeEmailData): EmailTemplate {
  const name = escapeHtml(data.name || 'there');

  const html = baseTemplate(`
    <h1>Welcome to Blockd!</h1>

    <p>Hello ${name},</p>

    <p>Thank you for joining Blockd - the intelligent interview integrity platform. We're excited to have you on board!</p>

    <p>Blockd helps organizations maintain interview integrity through advanced AI-powered security monitoring, ensuring fair and honest assessments for everyone.</p>

    <h2 style="font-size: 18px; font-weight: 600; color: #18181b; margin: 32px 0 16px 0;">Get Started</h2>

    <table role="presentation" style="width: 100%; margin: 16px 0;">
      <tr>
        <td style="padding: 16px; background-color: #f4f4f5; border-radius: 8px; margin-bottom: 12px;">
          <p style="margin: 0 0 4px 0; font-weight: 600; color: #18181b;">1. Complete Your Profile</p>
          <p style="margin: 0; font-size: 14px; color: #71717a;">Add your details and preferences to personalize your experience.</p>
        </td>
      </tr>
      <tr><td style="height: 12px;"></td></tr>
      <tr>
        <td style="padding: 16px; background-color: #f4f4f5; border-radius: 8px; margin-bottom: 12px;">
          <p style="margin: 0 0 4px 0; font-weight: 600; color: #18181b;">2. Enable Two-Factor Authentication</p>
          <p style="margin: 0; font-size: 14px; color: #71717a;">Add an extra layer of security to protect your account.</p>
        </td>
      </tr>
      <tr><td style="height: 12px;"></td></tr>
      <tr>
        <td style="padding: 16px; background-color: #f4f4f5; border-radius: 8px;">
          <p style="margin: 0 0 4px 0; font-weight: 600; color: #18181b;">3. Explore the Platform</p>
          <p style="margin: 0; font-size: 14px; color: #71717a;">Discover all the features designed to ensure interview integrity.</p>
        </td>
      </tr>
    </table>

    <div class="button-container">
      <a href="https://app.blockd.io/dashboard" class="button">Go to Dashboard</a>
    </div>

    <div class="info-box">
      <p>Need help getting started? Check out our <a href="https://blockd.io/docs" style="color: #0066cc;">documentation</a> or reach out to our <a href="https://blockd.io/support" style="color: #0066cc;">support team</a>.</p>
    </div>

    <p>Welcome aboard!</p>
    <p style="color: #71717a;">The Blockd Team</p>
  `);

  const text = `
Hello ${data.name || 'there'},

Welcome to Blockd - the intelligent interview integrity platform!

We're excited to have you on board. Here's what you can do next:

1. Complete your profile - Add your details and preferences
2. Set up two-factor authentication - Add extra security to your account
3. Explore the platform - Discover all our features

Need help? Visit our documentation at https://blockd.io/docs or contact support at https://blockd.io/support.

Welcome aboard!

The Blockd Team

---
Blockd - AI-Powered Interview Security
https://blockd.io
  `.trim();

  return {
    subject: 'Welcome to Blockd!',
    html,
    text,
  };
}
