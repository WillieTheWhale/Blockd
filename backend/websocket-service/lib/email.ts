/**
 * Email Service for WebSocket Service
 * Handles security alert email notifications to interviewers
 *
 * Uses SendGrid API directly - keep in sync with auth-service implementation
 */

import { loadConfig } from '../src/config';
import { logger } from './logger';
import { prisma } from './prisma';

// Lazy load config
let configLoaded = false;
let emailConfig: {
  enabled: boolean;
  provider: string;
  apiKey: string;
  from: string;
  fromName: string;
};

function getEmailConfig() {
  if (!configLoaded) {
    const config = loadConfig();
    emailConfig = {
      enabled: process.env.EMAIL_ENABLED === 'true',
      provider: process.env.EMAIL_PROVIDER || 'console',
      apiKey: process.env.SENDGRID_API_KEY || '',
      from: process.env.EMAIL_FROM || 'noreply@blockd.io',
      fromName: process.env.EMAIL_FROM_NAME || 'Blockd Security',
    };
    configLoaded = true;
  }
  return emailConfig;
}

interface SecurityAlertEmailData {
  sessionId: string;
  eventType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  timestamp: Date;
  intervieweeName?: string;
  metadata?: Record<string, unknown>;
}

interface InterviewerInfo {
  email: string;
  firstName: string | null;
  lastName: string | null;
}

/**
 * Get severity color for email styling
 */
function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return '#dc2626'; // red-600
    case 'high':
      return '#ea580c'; // orange-600
    case 'medium':
      return '#d97706'; // amber-600
    case 'low':
      return '#2563eb'; // blue-600
    default:
      return '#6b7280'; // gray-500
  }
}

/**
 * Format event type for display
 */
function formatEventType(eventType: string): string {
  return eventType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Generate HTML email for security alert
 */
function generateSecurityAlertHtml(
  data: SecurityAlertEmailData,
  interviewer: InterviewerInfo
): string {
  const severityColor = getSeverityColor(data.severity);
  const interviewerName = interviewer.firstName
    ? `${interviewer.firstName} ${interviewer.lastName || ''}`.trim()
    : 'Interviewer';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Security Alert</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); padding: 30px; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Security Alert</h1>
    <p style="color: #e0e0e0; margin: 10px 0 0 0;">Blockd Interview Security</p>
  </div>

  <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="margin-top: 0;">Hello ${interviewerName},</p>

    <p>A security event has been detected during your interview session:</p>

    <div style="background: #fef2f2; border-left: 4px solid ${severityColor}; padding: 20px; margin: 20px 0; border-radius: 4px;">
      <h2 style="margin: 0 0 10px 0; color: ${severityColor}; font-size: 18px;">
        ${data.severity.toUpperCase()} Security Event
      </h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280; width: 120px;">Event Type:</td>
          <td style="padding: 8px 0; font-weight: 600;">${formatEventType(data.eventType)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Description:</td>
          <td style="padding: 8px 0;">${data.description || 'No additional details'}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Session ID:</td>
          <td style="padding: 8px 0; font-family: monospace; font-size: 12px;">${data.sessionId}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Time:</td>
          <td style="padding: 8px 0;">${data.timestamp.toLocaleString()}</td>
        </tr>
        ${data.intervieweeName ? `
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Interviewee:</td>
          <td style="padding: 8px 0;">${data.intervieweeName}</td>
        </tr>
        ` : ''}
      </table>
    </div>

    ${data.severity === 'critical' ? `
    <div style="background: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 4px; margin: 20px 0;">
      <p style="margin: 0; color: #92400e;">
        <strong>Immediate Action Required:</strong> This is a critical security event. Please review the session immediately and consider whether to terminate the interview.
      </p>
    </div>
    ` : ''}

    <p>You can view full session details and security events in the Blockd dashboard.</p>

    <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
      This is an automated security notification from Blockd. If you believe this alert was sent in error, please contact support.
    </p>
  </div>

  <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; text-align: center;">
    <p style="color: #6b7280; font-size: 12px; margin: 0;">
      &copy; ${new Date().getFullYear()} Blockd. All rights reserved.
    </p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate plain text email for security alert
 */
function generateSecurityAlertText(
  data: SecurityAlertEmailData,
  interviewer: InterviewerInfo
): string {
  const interviewerName = interviewer.firstName
    ? `${interviewer.firstName} ${interviewer.lastName || ''}`.trim()
    : 'Interviewer';

  return `
SECURITY ALERT - Blockd Interview Security

Hello ${interviewerName},

A security event has been detected during your interview session:

EVENT DETAILS
-------------
Severity: ${data.severity.toUpperCase()}
Event Type: ${formatEventType(data.eventType)}
Description: ${data.description || 'No additional details'}
Session ID: ${data.sessionId}
Time: ${data.timestamp.toLocaleString()}
${data.intervieweeName ? `Interviewee: ${data.intervieweeName}` : ''}

${data.severity === 'critical' ? `
IMMEDIATE ACTION REQUIRED
This is a critical security event. Please review the session immediately
and consider whether to terminate the interview.
` : ''}

You can view full session details and security events in the Blockd dashboard.

---
This is an automated security notification from Blockd.
If you believe this alert was sent in error, please contact support.
  `.trim();
}

/**
 * Send security alert email via SendGrid
 */
async function sendViaSendGrid(
  to: string,
  subject: string,
  text: string,
  html: string
): Promise<void> {
  const config = getEmailConfig();

  if (!config.apiKey) {
    throw new Error('SendGrid API key not configured');
  }

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: config.from, name: config.fromName },
      subject,
      content: [
        { type: 'text/plain', value: text },
        { type: 'text/html', value: html },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SendGrid API error: ${response.status} - ${errorText}`);
  }
}

/**
 * Log email to console (development mode)
 */
function logToConsole(
  to: string,
  subject: string,
  text: string
): void {
  logger.info('=== SECURITY ALERT EMAIL (Console Mode) ===');
  logger.info(`To: ${to}`);
  logger.info(`Subject: ${subject}`);
  logger.info(`Body:\n${text}`);
  logger.info('===========================================');
}

/**
 * Send security alert email to interviewer
 */
export async function sendSecurityAlertEmail(
  data: SecurityAlertEmailData
): Promise<void> {
  const config = getEmailConfig();

  try {
    // Fetch session and interviewer info
    const session = await prisma.interviewSession.findUnique({
      where: { id: data.sessionId },
      include: {
        interviewer: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        interviewee: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!session) {
      logger.error('Cannot send security alert: session not found', {
        sessionId: data.sessionId,
      });
      return;
    }

    const interviewer = session.interviewer;
    const intervieweeName = session.interviewee
      ? `${session.interviewee.firstName || ''} ${session.interviewee.lastName || ''}`.trim()
      : undefined;

    const alertData: SecurityAlertEmailData = {
      ...data,
      intervieweeName,
    };

    const subject = `[${data.severity.toUpperCase()}] Security Alert - ${formatEventType(data.eventType)}`;
    const html = generateSecurityAlertHtml(alertData, interviewer);
    const text = generateSecurityAlertText(alertData, interviewer);

    if (!config.enabled) {
      logToConsole(interviewer.email, subject, text);
      return;
    }

    if (config.provider === 'sendgrid') {
      await sendViaSendGrid(interviewer.email, subject, text, html);
      logger.info('Security alert email sent', {
        to: interviewer.email,
        sessionId: data.sessionId,
        severity: data.severity,
        eventType: data.eventType,
      });
    } else {
      // Console fallback for other providers
      logToConsole(interviewer.email, subject, text);
    }
  } catch (error) {
    logger.error('Failed to send security alert email', error, {
      sessionId: data.sessionId,
      eventType: data.eventType,
      severity: data.severity,
    });
    // Don't throw - email failure shouldn't break security event handling
  }
}
