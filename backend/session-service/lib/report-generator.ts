import PDFDocument from 'pdfkit';
import { SessionReport, PDFReportOptions, ReportExport } from '../types/report.types';
import { ReportGenerationError } from './errors';

/**
 * Report Generator
 * Generates session reports in JSON and PDF formats
 */

export class ReportGenerator {
  /**
   * Generate JSON report
   */
  static generateJSON(report: SessionReport): ReportExport {
    try {
      const content = JSON.stringify(report, null, 2);

      return {
        format: 'json',
        content,
        filename: `session-report-${report.session_id}-${Date.now()}.json`,
        mime_type: 'application/json',
        size_bytes: Buffer.byteLength(content, 'utf8'),
        generated_at: new Date().toISOString(),
      };
    } catch (error) {
      throw new ReportGenerationError(
        `JSON generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generate PDF report
   */
  static async generatePDF(
    report: SessionReport,
    options: PDFReportOptions = {
      include_cover_page: true,
      include_table_of_contents: false,
      include_charts: false,
      include_detailed_timeline: true,
    }
  ): Promise<ReportExport> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const buffers: Buffer[] = [];

        // Collect PDF chunks
        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve({
            format: 'pdf',
            content: pdfBuffer,
            filename: `session-report-${report.session_id}-${Date.now()}.pdf`,
            mime_type: 'application/pdf',
            size_bytes: pdfBuffer.length,
            generated_at: new Date().toISOString(),
          });
        });
        doc.on('error', (error) => {
          reject(new ReportGenerationError(`PDF generation failed: ${error.message}`));
        });

        // Generate PDF content
        this.buildPDFContent(doc, report, options);

        // Finalize PDF
        doc.end();
      } catch (error) {
        reject(
          new ReportGenerationError(
            `PDF generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          )
        );
      }
    });
  }

  /**
   * Build PDF content
   */
  private static buildPDFContent(
    doc: PDFKit.PDFDocument,
    report: SessionReport,
    options: PDFReportOptions
  ): void {
    // Cover page
    if (options.include_cover_page) {
      this.addCoverPage(doc, report);
      doc.addPage();
    }

    // Session metadata
    this.addSessionMetadata(doc, report);
    doc.moveDown(2);

    // Overall assessment
    this.addOverallAssessment(doc, report);
    doc.addPage();

    // Risk analysis
    this.addRiskAnalysis(doc, report);
    doc.addPage();

    // Security summary
    this.addSecuritySummary(doc, report);
    doc.addPage();

    // Questions and answers
    this.addQuestionsAndAnswers(doc, report);

    // Behavioral analysis
    if (report.gaze_analysis) {
      doc.addPage();
      this.addGazeAnalysis(doc, report);
    }

    if (report.timing_analysis) {
      doc.addPage();
      this.addTimingAnalysis(doc, report);
    }

    // Recommendations
    doc.addPage();
    this.addRecommendations(doc, report);

    // Footer
    if (options.footer_text) {
      this.addFooter(doc, options.footer_text);
    }
  }

  private static addCoverPage(doc: PDFKit.PDFDocument, report: SessionReport): void {
    doc.fontSize(28).font('Helvetica-Bold').text('Interview Session Report', { align: 'center' });
    doc.moveDown(2);

    doc
      .fontSize(16)
      .font('Helvetica')
      .text(`Session ID: ${report.session_id}`, { align: 'center' });
    doc.moveDown(0.5);

    doc
      .fontSize(14)
      .text(`Generated: ${new Date(report.generated_at).toLocaleString()}`, { align: 'center' });
    doc.moveDown(3);

    // Risk level badge
    const riskLevel = report.risk_analysis.risk_level.toUpperCase();
    const riskColor = this.getRiskColor(report.risk_analysis.risk_level);

    doc.fontSize(20).fillColor(riskColor).text(`Risk Level: ${riskLevel}`, { align: 'center' });
    doc.fillColor('black');
  }

  private static addSessionMetadata(doc: PDFKit.PDFDocument, report: SessionReport): void {
    doc.fontSize(18).font('Helvetica-Bold').text('Session Information');
    doc.moveDown(1);

    doc.fontSize(12).font('Helvetica');
    doc.text(`Status: ${report.session_metadata.status}`);
    doc.text(`Interviewer: ${report.interviewer.full_name} (${report.interviewer.email})`);
    doc.text(`Interviewee: ${report.interviewee.full_name} (${report.interviewee.email})`);
    doc.text(`Organization: ${report.session_metadata.organization.name}`);

    if (report.session_metadata.actual_start) {
      doc.text(`Started: ${new Date(report.session_metadata.actual_start).toLocaleString()}`);
    }
    if (report.session_metadata.actual_end) {
      doc.text(`Ended: ${new Date(report.session_metadata.actual_end).toLocaleString()}`);
    }
    if (report.session_metadata.duration_minutes) {
      doc.text(`Duration: ${report.session_metadata.duration_minutes} minutes`);
    }
  }

  private static addOverallAssessment(doc: PDFKit.PDFDocument, report: SessionReport): void {
    doc.fontSize(18).font('Helvetica-Bold').text('Overall Assessment');
    doc.moveDown(1);

    const assessment = report.overall_assessment;

    doc.fontSize(14).font('Helvetica-Bold');
    doc.text(`Verdict: ${assessment.verdict.toUpperCase()}`);
    doc.text(`Confidence: ${(assessment.confidence * 100).toFixed(1)}%`);
    doc.moveDown(1);

    doc.fontSize(12).font('Helvetica');
    doc.text('Summary:');
    doc.text(assessment.summary, { indent: 20 });
    doc.moveDown(1);

    if (assessment.key_findings.length > 0) {
      doc.font('Helvetica-Bold').text('Key Findings:');
      doc.font('Helvetica');
      assessment.key_findings.forEach((finding) => {
        doc.text(`• ${finding}`, { indent: 20 });
      });
      doc.moveDown(1);
    }

    if (assessment.red_flags.length > 0) {
      doc.font('Helvetica-Bold').fillColor('red').text('Red Flags:');
      doc.fillColor('black').font('Helvetica');
      assessment.red_flags.forEach((flag) => {
        doc.text(`• ${flag}`, { indent: 20 });
      });
    }
  }

  private static addRiskAnalysis(doc: PDFKit.PDFDocument, report: SessionReport): void {
    doc.fontSize(18).font('Helvetica-Bold').text('Risk Analysis');
    doc.moveDown(1);

    const risk = report.risk_analysis;

    doc.fontSize(12).font('Helvetica');
    doc.text(`Overall Risk Score: ${(risk.overall_risk_score * 100).toFixed(1)}%`);
    doc.text(`Risk Level: ${risk.risk_level.toUpperCase()}`);
    doc.moveDown(1);

    doc.font('Helvetica-Bold').text('Component Scores:');
    doc.font('Helvetica');
    doc.text(`  AI Detection: ${(risk.ai_detection_score * 100).toFixed(1)}%`);
    doc.text(`  Security Events: ${(risk.security_events_score * 100).toFixed(1)}%`);
    doc.text(`  Gaze Anomaly: ${(risk.gaze_anomaly_score * 100).toFixed(1)}%`);
    doc.text(`  Timing Anomaly: ${(risk.timing_anomaly_score * 100).toFixed(1)}%`);
    doc.moveDown(1);

    if (risk.flagged_answers.length > 0) {
      doc.font('Helvetica-Bold').text(`Flagged Answers: ${risk.flagged_answers.length}`);
      doc.font('Helvetica');
    }

    if (risk.flagged_behaviors.length > 0) {
      doc.font('Helvetica-Bold').text('Flagged Behaviors:');
      doc.font('Helvetica');
      risk.flagged_behaviors.forEach((behavior) => {
        doc.text(`• ${behavior}`, { indent: 20 });
      });
    }
  }

  private static addSecuritySummary(doc: PDFKit.PDFDocument, report: SessionReport): void {
    doc.fontSize(18).font('Helvetica-Bold').text('Security Summary');
    doc.moveDown(1);

    const security = report.security_summary;

    doc.fontSize(12).font('Helvetica');
    doc.text(`Total Security Events: ${security.total_events}`);
    doc.moveDown(0.5);

    doc.font('Helvetica-Bold').text('Events by Severity:');
    doc.font('Helvetica');
    doc.text(`  Low: ${security.events_by_severity.low}`);
    doc.text(`  Medium: ${security.events_by_severity.medium}`);
    doc.text(`  High: ${security.events_by_severity.high}`);
    doc.text(`  Critical: ${security.events_by_severity.critical}`);
    doc.moveDown(1);

    if (security.critical_events.length > 0) {
      doc.font('Helvetica-Bold').fillColor('red').text('Critical Events:');
      doc.fillColor('black').font('Helvetica');
      security.critical_events.forEach((event) => {
        doc.text(
          `• ${event.event_type} - ${event.description || 'No description'}`,
          { indent: 20 }
        );
      });
    }
  }

  private static addQuestionsAndAnswers(doc: PDFKit.PDFDocument, report: SessionReport): void {
    doc.fontSize(18).font('Helvetica-Bold').text('Questions & Answers');
    doc.moveDown(1);

    report.questions_and_answers.forEach((qa, index) => {
      if (index > 0) doc.moveDown(1);

      doc.fontSize(12).font('Helvetica-Bold');
      doc.text(`Q${index + 1}: ${qa.question_text}`);

      doc.fontSize(10).font('Helvetica');
      if (qa.difficulty) doc.text(`Difficulty: ${qa.difficulty}`);

      if (qa.answer) {
        doc.moveDown(0.5);
        doc.text('Answer:');
        doc.text(qa.answer.answer_text, { indent: 20 });

        if (qa.answer.risk_score !== null) {
          const riskText = `Risk Score: ${(qa.answer.risk_score * 100).toFixed(1)}%`;
          const color = qa.answer.risk_score > 0.75 ? 'red' : 'black';
          doc.fillColor(color).text(riskText, { indent: 20 });
          doc.fillColor('black');
        }

        if (qa.answer.is_ai_generated) {
          doc.fillColor('red').text('⚠ Potentially AI-generated', { indent: 20 });
          doc.fillColor('black');
        }
      } else {
        doc.moveDown(0.5);
        doc.text('No answer provided', { indent: 20 });
      }
    });
  }

  private static addGazeAnalysis(doc: PDFKit.PDFDocument, report: SessionReport): void {
    if (!report.gaze_analysis) return;

    doc.fontSize(18).font('Helvetica-Bold').text('Gaze Tracking Analysis');
    doc.moveDown(1);

    const gaze = report.gaze_analysis;

    doc.fontSize(12).font('Helvetica');
    doc.text(`Total Gaze Events: ${gaze.total_gaze_events}`);
    doc.text(`Off-Screen Events: ${gaze.off_screen_events}`);
    doc.text(`Off-Screen Percentage: ${gaze.off_screen_percentage.toFixed(1)}%`);
    doc.text(`Off-Screen Duration: ${gaze.off_screen_duration_seconds} seconds`);
    doc.moveDown(1);

    doc.font('Helvetica-Bold').text('Off-Screen by Direction:');
    doc.font('Helvetica');
    doc.text(`  Left: ${gaze.off_screen_by_direction.left}`);
    doc.text(`  Right: ${gaze.off_screen_by_direction.right}`);
    doc.text(`  Up: ${gaze.off_screen_by_direction.up}`);
    doc.text(`  Down: ${gaze.off_screen_by_direction.down}`);
  }

  private static addTimingAnalysis(doc: PDFKit.PDFDocument, report: SessionReport): void {
    if (!report.timing_analysis) return;

    doc.fontSize(18).font('Helvetica-Bold').text('Response Timing Analysis');
    doc.moveDown(1);

    const timing = report.timing_analysis;

    doc.fontSize(12).font('Helvetica');
    doc.text(`Average Response Latency: ${timing.avg_response_latency_ms}ms`);
    doc.text(`Average Words Per Minute: ${timing.avg_words_per_minute}`);
    doc.text(`Average Pause Count: ${timing.avg_pause_count}`);
    doc.text(`Average Filler Ratio: ${(timing.avg_filler_ratio * 100).toFixed(1)}%`);
    doc.moveDown(1);

    doc.text(`Unusually Fast Responses: ${timing.unusually_fast_responses}`);
    doc.text(`Unusually Slow Responses: ${timing.unusually_slow_responses}`);
  }

  private static addRecommendations(doc: PDFKit.PDFDocument, report: SessionReport): void {
    doc.fontSize(18).font('Helvetica-Bold').text('Recommendations');
    doc.moveDown(1);

    report.recommendations.forEach((rec) => {
      doc.fontSize(12).font('Helvetica-Bold');
      const severityColor = rec.severity === 'critical' || rec.severity === 'high' ? 'red' : 'black';
      doc.fillColor(severityColor);
      doc.text(`[${rec.severity.toUpperCase()}] ${rec.title}`);
      doc.fillColor('black');

      doc.fontSize(10).font('Helvetica');
      doc.text(rec.description, { indent: 20 });
      doc.moveDown(1);
    });
  }

  private static addFooter(doc: PDFKit.PDFDocument, text: string): void {
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).text(text, 50, doc.page.height - 50, { align: 'center' });
    }
  }

  private static getRiskColor(level: string): string {
    const colors: { [key: string]: string } = {
      low: 'green',
      medium: 'orange',
      high: 'red',
      critical: 'darkred',
    };
    return colors[level] || 'black';
  }
}
