import { config } from '../src/config';
import { SessionReport } from '../types/report.types';

/**
 * Notification Service
 * Handles email and notification dispatch
 */

export class NotificationService {
  /**
   * Send session invitation email
   */
  async sendInvitationEmail(
    recipientEmail: string,
    sessionId: string,
    joinUrl: string,
    scheduledStart: string
  ): Promise<void> {
    const emailData = {
      to: recipientEmail,
      subject: 'Interview Session Invitation - Blockd',
      template: 'session-invitation',
      data: {
        session_id: sessionId,
        join_url: joinUrl,
        scheduled_start: scheduledStart,
      },
    };

    await this.sendEmail(emailData);
  }

  /**
   * Send session started notification
   */
  async sendSessionStartedEmail(
    recipientEmail: string,
    sessionId: string,
    startedAt: string
  ): Promise<void> {
    const emailData = {
      to: recipientEmail,
      subject: 'Interview Session Started - Blockd',
      template: 'session-started',
      data: {
        session_id: sessionId,
        started_at: startedAt,
      },
    };

    await this.sendEmail(emailData);
  }

  /**
   * Send session ended notification
   */
  async sendSessionEndedEmail(
    recipientEmail: string,
    sessionId: string,
    duration: number,
    reportId: string
  ): Promise<void> {
    const emailData = {
      to: recipientEmail,
      subject: 'Interview Session Completed - Blockd',
      template: 'session-ended',
      data: {
        session_id: sessionId,
        duration_minutes: duration,
        report_id: reportId,
      },
    };

    await this.sendEmail(emailData);
  }

  /**
   * Send session report email
   */
  async sendReportEmail(recipientEmail: string, report: SessionReport): Promise<void> {
    const emailData = {
      to: recipientEmail,
      subject: `Interview Report - ${report.session_metadata.organization.name}`,
      template: 'session-report',
      data: {
        report_id: report.report_id,
        session_id: report.session_id,
        interviewee_name: report.interviewee.full_name,
        overall_assessment: report.overall_assessment.verdict,
        risk_score: (report.risk_analysis.overall_risk_score * 100).toFixed(1),
        report_url: `${config.frontend.url}/reports/${report.report_id}`,
      },
    };

    await this.sendEmail(emailData);
  }

  /**
   * Send security alert email
   */
  async sendSecurityAlertEmail(
    recipientEmail: string,
    sessionId: string,
    eventType: string,
    severity: string,
    description: string
  ): Promise<void> {
    const emailData = {
      to: recipientEmail,
      subject: `Security Alert - ${severity.toUpperCase()} - Blockd`,
      template: 'security-alert',
      data: {
        session_id: sessionId,
        event_type: eventType,
        severity,
        description,
      },
    };

    await this.sendEmail(emailData);
  }

  /**
   * Send email via email service
   */
  private async sendEmail(emailData: {
    to: string;
    subject: string;
    template: string;
    data: Record<string, unknown>;
  }): Promise<void> {
    try {
      // In production, this would call the email service API
      // For now, we'll just log it
      console.log('Sending email:', {
        to: emailData.to,
        subject: emailData.subject,
        template: emailData.template,
      });

      // Example: Make HTTP request to email service
      // await fetch(`${config.services.email}/send`, {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //   },
      //   body: JSON.stringify(emailData),
      // });
    } catch (error) {
      console.error('Failed to send email:', error);
      // Don't throw - email failures shouldn't break the flow
    }
  }

  /**
   * Send WebSocket notification (via socket server)
   */
  async sendWebSocketNotification(
    sessionId: string,
    event: string,
    data: Record<string, unknown>
  ): Promise<void> {
    // This would be handled by the WebSocket server
    // Just log for now
    console.log('WebSocket notification:', { sessionId, event, data });
  }
}

export default new NotificationService();
