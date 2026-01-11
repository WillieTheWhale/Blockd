/**
 * Email Service (Re-export for backward compatibility)
 * Blockd Auth Service
 *
 * @deprecated Import from './email/index' instead
 *
 * This file re-exports from the new email module to maintain
 * backward compatibility with existing imports.
 */

export {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendMFASetupEmail,
  sendLoginAlertEmail,
  sendWelcomeEmail,
} from './email/index';

export type {
  VerificationEmailData,
  PasswordResetEmailData,
  MFASetupEmailData,
  LoginAlertEmailData,
  WelcomeEmailData,
  EmailOptions,
  EmailResult,
} from './email/index';
