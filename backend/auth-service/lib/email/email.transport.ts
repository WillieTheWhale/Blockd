/**
 * Email Transport Layer
 * Blockd Auth Service
 *
 * Handles sending emails via AWS SES or console (dev mode)
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import type { EmailOptions, EmailResult, EmailTransport, SESTransportConfig } from './email.types';

/**
 * Validate email address format and check for header injection
 */
function validateEmailAddress(email: string): void {
  // Check for header injection characters
  if (/[\r\n]/.test(email)) {
    throw new Error('Email address contains invalid characters (potential header injection)');
  }
  // Basic email format validation (RFC 5322 simplified)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error('Invalid email format');
  }
}

/**
 * Validate subject line for header injection
 */
function validateSubject(subject: string): void {
  if (/[\r\n]/.test(subject)) {
    throw new Error('Subject contains invalid characters (potential header injection)');
  }
}

/**
 * Console transport for development mode
 * Logs emails to console instead of sending
 */
export class ConsoleTransport implements EmailTransport {
  async send(options: EmailOptions): Promise<EmailResult> {
    // Validate inputs even in dev mode to catch issues early
    try {
      validateEmailAddress(options.to);
      validateSubject(options.subject);
      if (options.from) {
        validateEmailAddress(options.from);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Validation error';
      console.error(`📧 [EMAIL VALIDATION FAILED] ${errorMessage}`);
      return {
        success: false,
        error: errorMessage,
      };
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('📧 [EMAIL - DEV MODE]');
    console.log('='.repeat(60));
    console.log(`To:      ${options.to}`);
    console.log(`From:    ${options.from || 'noreply@blockd.io'}`);
    console.log(`Subject: ${options.subject}`);
    console.log('-'.repeat(60));
    console.log('Plain Text:');
    console.log(options.text);
    console.log('='.repeat(60));
    console.log('');

    return {
      success: true,
      messageId: `dev-${Date.now()}`,
    };
  }
}

/**
 * AWS SES transport for production
 */
export class SESTransport implements EmailTransport {
  private client: SESClient | null = null;
  private config: SESTransportConfig;

  constructor(config: SESTransportConfig) {
    this.config = config;

    if (config.enabled) {
      this.client = new SESClient({
        region: config.region,
        ...(config.accessKeyId && config.secretAccessKey
          ? {
              credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
              },
            }
          : {}),
      });
    }
  }

  async send(options: EmailOptions): Promise<EmailResult> {
    // Validate inputs to prevent header injection
    try {
      validateEmailAddress(options.to);
      validateSubject(options.subject);
      if (options.from) {
        validateEmailAddress(options.from);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Validation error';
      console.error(`📧 [EMAIL VALIDATION FAILED] ${errorMessage}`);
      return {
        success: false,
        error: errorMessage,
      };
    }

    // If not enabled, use console transport
    if (!this.config.enabled || !this.client) {
      console.log(`📧 [EMAIL STUB] Email disabled - To: ${options.to}, Subject: ${options.subject}`);
      return {
        success: true,
        messageId: `stub-${Date.now()}`,
      };
    }

    try {
      const command = new SendEmailCommand({
        Source: options.from || this.config.from,
        Destination: {
          ToAddresses: [options.to],
        },
        Message: {
          Subject: {
            Data: options.subject,
            Charset: 'UTF-8',
          },
          Body: {
            Html: {
              Data: options.html,
              Charset: 'UTF-8',
            },
            Text: {
              Data: options.text,
              Charset: 'UTF-8',
            },
          },
        },
      });

      const response = await this.client.send(command);

      console.log(`📧 [EMAIL SENT] To: ${options.to}, Subject: ${options.subject}, MessageId: ${response.MessageId}`);

      return {
        success: true,
        messageId: response.MessageId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      console.error(`📧 [EMAIL FAILED] To: ${options.to}, Subject: ${options.subject}, Error: ${errorMessage}`);

      // Return error result but don't throw - email failures shouldn't break auth flows
      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}

/**
 * Create the appropriate email transport based on configuration
 */
export function createTransport(config: SESTransportConfig): EmailTransport {
  const isDev = process.env.NODE_ENV === 'development';

  if (isDev && !config.enabled) {
    return new ConsoleTransport();
  }

  return new SESTransport(config);
}
