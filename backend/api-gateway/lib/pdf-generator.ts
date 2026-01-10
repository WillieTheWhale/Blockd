/**
 * PDF Report Generator for Blockd Session Reports
 * Uses PDFKit to generate professional PDF reports
 */

import PDFDocument from 'pdfkit';

/**
 * Session report data structure
 */
export interface SessionReportData {
  // Session info
  sessionId: string;
  status: string;
  scheduledStart?: Date | null;
  actualStart?: Date | null;
  actualEnd?: Date | null;
  durationMinutes?: number | null;

  // Participants
  interviewer: {
    email: string;
    firstName?: string | null;
    lastName?: string | null;
  };
  interviewee: {
    email: string;
    firstName?: string | null;
    lastName?: string | null;
  };

  // Report data
  report: {
    overallRiskScore: number;
    aiDetectionScore: number;
    gazeAnomalyScore: number;
    timingAnomalyScore: number;
    securityEventsCount: number;
    recommendations: string[];
    detailedAnalysis: {
      questionsAsked: number;
      answersAnalyzed: number;
      aiGeneratedAnswers: number;
      securityEvents: number;
    };
    createdAt: Date;
  };

  // Security events
  securityEvents?: Array<{
    eventType: string;
    severity: string;
    description?: string | null;
    timestamp: Date;
  }>;

  // Answer analyses
  answerAnalyses?: Array<{
    questionText: string;
    riskScore: number;
    isAiGenerated: boolean;
    similarityScores?: Record<string, number>;
    recommendations?: string[];
  }>;
}

/**
 * PDF styling constants
 */
const COLORS = {
  primary: '#1a1a2e',
  secondary: '#16213e',
  accent: '#0f3460',
  success: '#4CAF50',
  warning: '#FF9800',
  danger: '#f44336',
  text: '#333333',
  lightText: '#666666',
  border: '#e0e0e0',
  background: '#f8f9fa',
  white: '#ffffff',
};

/**
 * Get risk color based on score
 */
function getRiskColor(score: number): string {
  if (score >= 0.7) return COLORS.danger;
  if (score >= 0.4) return COLORS.warning;
  return COLORS.success;
}

/**
 * Get severity color
 */
function getSeverityColor(severity: string): string {
  switch (severity.toLowerCase()) {
    case 'critical':
      return COLORS.danger;
    case 'high':
      return '#ff5722';
    case 'medium':
      return COLORS.warning;
    case 'low':
    default:
      return COLORS.success;
  }
}

/**
 * Format date for display
 */
function formatDate(date: Date | string | null | undefined): string {
  if (!date) return 'N/A';
  const d = new Date(date);
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format duration in minutes to readable string
 */
function formatDuration(minutes: number | null | undefined): string {
  if (!minutes) return 'N/A';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins} minutes`;
}

/**
 * Format percentage
 */
function formatPercentage(score: number): string {
  return `${(score * 100).toFixed(1)}%`;
}

/**
 * Get risk level label
 */
function getRiskLevel(score: number): string {
  if (score >= 0.8) return 'CRITICAL';
  if (score >= 0.6) return 'HIGH';
  if (score >= 0.4) return 'MEDIUM';
  if (score >= 0.2) return 'LOW';
  return 'MINIMAL';
}

/**
 * Generate PDF report buffer using PDFKit
 */
export async function generateSessionReportPdf(data: SessionReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        info: {
          Title: `Session Report - ${data.sessionId}`,
          Author: 'Blockd Interview Security Platform',
          Subject: 'Interview Session Report',
          CreationDate: new Date(),
        },
        bufferPages: true,
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const interviewerName = data.interviewer.firstName && data.interviewer.lastName
        ? `${data.interviewer.firstName} ${data.interviewer.lastName}`
        : data.interviewer.email;

      const intervieweeName = data.interviewee.firstName && data.interviewee.lastName
        ? `${data.interviewee.firstName} ${data.interviewee.lastName}`
        : data.interviewee.email;

      // Page 1: Header and Summary
      // ==========================================

      // Logo/Header
      doc
        .fontSize(28)
        .fillColor(COLORS.primary)
        .text('BLOCKD', { align: 'center' })
        .fontSize(14)
        .fillColor(COLORS.secondary)
        .text('Interview Security Platform', { align: 'center' })
        .moveDown(0.5);

      // Title
      doc
        .fontSize(20)
        .fillColor(COLORS.primary)
        .text('Session Report', { align: 'center' })
        .moveDown(0.3);

      // Report metadata
      doc
        .fontSize(9)
        .fillColor(COLORS.lightText)
        .text(`Generated: ${formatDate(new Date())}`, { align: 'center' })
        .text(`Session ID: ${data.sessionId}`, { align: 'center' })
        .moveDown(1.5);

      // Risk Score Box
      const riskColor = getRiskColor(data.report.overallRiskScore);
      const riskLevel = getRiskLevel(data.report.overallRiskScore);

      doc
        .rect(doc.x, doc.y, 495, 60)
        .fillAndStroke(COLORS.background, COLORS.border);

      doc
        .fontSize(12)
        .fillColor(COLORS.text)
        .text('Overall Risk Assessment', doc.x + 15, doc.y + 15);

      doc
        .fontSize(24)
        .fillColor(riskColor)
        .text(`${formatPercentage(data.report.overallRiskScore)}`, doc.x + 15, doc.y + 35)
        .fontSize(14)
        .text(riskLevel, doc.x + 100, doc.y + 40);

      doc.y += 70;
      doc.moveDown(1);

      // Session Details Section
      doc
        .fontSize(14)
        .fillColor(COLORS.primary)
        .text('Session Details')
        .moveDown(0.3);

      doc
        .moveTo(doc.x, doc.y)
        .lineTo(doc.x + 495, doc.y)
        .strokeColor(COLORS.border)
        .stroke();

      doc.moveDown(0.5);

      // Session info grid
      const leftCol = doc.x;
      const rightCol = doc.x + 250;
      let currentY = doc.y;

      doc.fontSize(10).fillColor(COLORS.text);

      // Left column
      doc.text('Status:', leftCol, currentY, { continued: true }).fillColor(COLORS.lightText).text(` ${data.status.toUpperCase()}`);
      currentY += 18;
      doc.fillColor(COLORS.text).text('Interviewer:', leftCol, currentY, { continued: true }).fillColor(COLORS.lightText).text(` ${interviewerName}`);
      currentY += 18;
      doc.fillColor(COLORS.text).text('Scheduled Start:', leftCol, currentY, { continued: true }).fillColor(COLORS.lightText).text(` ${formatDate(data.scheduledStart)}`);
      currentY += 18;
      doc.fillColor(COLORS.text).text('Actual End:', leftCol, currentY, { continued: true }).fillColor(COLORS.lightText).text(` ${formatDate(data.actualEnd)}`);

      // Right column
      currentY = doc.y - 72;
      doc.fillColor(COLORS.text).text('Duration:', rightCol, currentY, { continued: true }).fillColor(COLORS.lightText).text(` ${formatDuration(data.durationMinutes)}`);
      currentY += 18;
      doc.fillColor(COLORS.text).text('Interviewee:', rightCol, currentY, { continued: true }).fillColor(COLORS.lightText).text(` ${intervieweeName}`);
      currentY += 18;
      doc.fillColor(COLORS.text).text('Actual Start:', rightCol, currentY, { continued: true }).fillColor(COLORS.lightText).text(` ${formatDate(data.actualStart)}`);

      doc.y = currentY + 40;
      doc.moveDown(1);

      // Risk Breakdown Section
      doc
        .fontSize(14)
        .fillColor(COLORS.primary)
        .text('Risk Breakdown')
        .moveDown(0.3);

      doc
        .moveTo(doc.x, doc.y)
        .lineTo(doc.x + 495, doc.y)
        .strokeColor(COLORS.border)
        .stroke();

      doc.moveDown(0.5);

      // Risk metrics
      const metrics = [
        { label: 'AI Detection Score', value: data.report.aiDetectionScore },
        { label: 'Gaze Anomaly Score', value: data.report.gazeAnomalyScore },
        { label: 'Timing Anomaly Score', value: data.report.timingAnomalyScore },
      ];

      doc.fontSize(10);
      metrics.forEach((metric) => {
        const color = getRiskColor(metric.value);
        doc
          .fillColor(COLORS.text)
          .text(`${metric.label}: `, { continued: true })
          .fillColor(color)
          .text(formatPercentage(metric.value));
      });

      doc.fillColor(COLORS.text).text(`Security Events: ${data.report.securityEventsCount}`);
      doc.moveDown(1);

      // Analysis Summary Section
      doc
        .fontSize(14)
        .fillColor(COLORS.primary)
        .text('Analysis Summary')
        .moveDown(0.3);

      doc
        .moveTo(doc.x, doc.y)
        .lineTo(doc.x + 495, doc.y)
        .strokeColor(COLORS.border)
        .stroke();

      doc.moveDown(0.5);

      const analysis = data.report.detailedAnalysis;
      doc.fontSize(10).fillColor(COLORS.text);
      doc.text(`Questions Asked: ${analysis.questionsAsked}`);
      doc.text(`Answers Analyzed: ${analysis.answersAnalyzed}`);
      doc.text(`AI-Generated Answers Detected: ${analysis.aiGeneratedAnswers}`);
      doc.text(`Security Events Recorded: ${analysis.securityEvents}`);
      doc.moveDown(1);

      // Recommendations Section
      if (data.report.recommendations.length > 0) {
        doc
          .fontSize(14)
          .fillColor(COLORS.primary)
          .text('Recommendations')
          .moveDown(0.3);

        doc
          .moveTo(doc.x, doc.y)
          .lineTo(doc.x + 495, doc.y)
          .strokeColor(COLORS.border)
          .stroke();

        doc.moveDown(0.5);

        doc.fontSize(10).fillColor(COLORS.text);
        data.report.recommendations.forEach((rec, i) => {
          doc.text(`${i + 1}. ${rec}`);
        });
        doc.moveDown(1);
      }

      // Security Events Section (if any, on new page)
      if (data.securityEvents && data.securityEvents.length > 0) {
        doc.addPage();

        doc
          .fontSize(14)
          .fillColor(COLORS.primary)
          .text('Security Events')
          .moveDown(0.3);

        doc
          .moveTo(doc.x, doc.y)
          .lineTo(doc.x + 495, doc.y)
          .strokeColor(COLORS.border)
          .stroke();

        doc.moveDown(0.5);

        doc.fontSize(9);
        const maxEvents = 25;
        const events = data.securityEvents.slice(0, maxEvents);

        events.forEach((event, i) => {
          const severityColor = getSeverityColor(event.severity);

          doc
            .fillColor(severityColor)
            .text(`[${event.severity.toUpperCase()}] `, { continued: true })
            .fillColor(COLORS.text)
            .text(event.eventType);

          if (event.description) {
            doc.fillColor(COLORS.lightText).text(`  ${event.description.substring(0, 80)}${event.description.length > 80 ? '...' : ''}`);
          }

          doc.fillColor(COLORS.lightText).text(`  ${formatDate(event.timestamp)}`);
          doc.moveDown(0.3);

          // Check if we need a new page
          if (doc.y > 700 && i < events.length - 1) {
            doc.addPage();
          }
        });

        if (data.securityEvents.length > maxEvents) {
          doc
            .fillColor(COLORS.lightText)
            .text(`... and ${data.securityEvents.length - maxEvents} more events`);
        }
      }

      // Answer Analyses Section (if any, on new page)
      if (data.answerAnalyses && data.answerAnalyses.length > 0) {
        doc.addPage();

        doc
          .fontSize(14)
          .fillColor(COLORS.primary)
          .text('Answer Analysis Details')
          .moveDown(0.3);

        doc
          .moveTo(doc.x, doc.y)
          .lineTo(doc.x + 495, doc.y)
          .strokeColor(COLORS.border)
          .stroke();

        doc.moveDown(0.5);

        doc.fontSize(9);
        data.answerAnalyses.forEach((answer, i) => {
          const riskColor = getRiskColor(answer.riskScore);
          const aiFlag = answer.isAiGenerated ? ' [AI DETECTED]' : '';

          doc
            .fillColor(COLORS.text)
            .text(`Q${i + 1}: ${answer.questionText.substring(0, 70)}${answer.questionText.length > 70 ? '...' : ''}`, { continued: answer.isAiGenerated })
            .fillColor(COLORS.danger)
            .text(aiFlag);

          doc
            .fillColor(COLORS.lightText)
            .text(`   Risk Score: `, { continued: true })
            .fillColor(riskColor)
            .text(formatPercentage(answer.riskScore));

          if (answer.similarityScores && Object.keys(answer.similarityScores).length > 0) {
            const scores = Object.entries(answer.similarityScores)
              .map(([model, score]) => `${model}: ${formatPercentage(score as number)}`)
              .join(', ');
            doc.fillColor(COLORS.lightText).text(`   AI Similarity: ${scores}`);
          }

          doc.moveDown(0.5);

          // Check if we need a new page
          if (doc.y > 700 && i < data.answerAnalyses!.length - 1) {
            doc.addPage();
          }
        });
      }

      // Footer on all pages
      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);

        // Footer line
        doc
          .moveTo(50, doc.page.height - 40)
          .lineTo(doc.page.width - 50, doc.page.height - 40)
          .strokeColor(COLORS.border)
          .stroke();

        // Footer text
        doc
          .fontSize(8)
          .fillColor(COLORS.lightText)
          .text(
            'Blockd Interview Security Platform - Confidential',
            50,
            doc.page.height - 35,
            { align: 'center', width: doc.page.width - 100 }
          )
          .text(
            `Page ${i + 1} of ${pageCount}`,
            50,
            doc.page.height - 25,
            { align: 'center', width: doc.page.width - 100 }
          );
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generate a filename for the PDF report
 */
export function generateReportFilename(sessionId: string, date?: Date): string {
  const timestamp = (date || new Date()).toISOString().split('T')[0];
  return `blockd-session-report-${sessionId.substring(0, 8)}-${timestamp}.pdf`;
}
