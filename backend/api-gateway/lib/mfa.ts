/**
 * Multi-Factor Authentication (MFA) Utilities
 * Uses speakeasy for TOTP generation and verification
 */

import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';

const APP_NAME = 'Blockd';
const TOTP_WINDOW = 2; // Allow 2 time steps before and after (±60 seconds)

export interface MFASetupResult {
  secret: string;
  qrCodeDataUrl: string;
  backupCodes: string[];
}

export interface MFAVerificationResult {
  valid: boolean;
  usedBackupCode: boolean;
}

/**
 * Generate MFA secret and QR code for user
 * @param email - User's email for the authenticator label
 * @returns MFA setup data including secret and QR code
 */
export async function generateMFASecret(email: string): Promise<MFASetupResult> {
  // Generate secret
  const secret = speakeasy.generateSecret({
    name: `${APP_NAME} (${email})`,
    issuer: APP_NAME,
    length: 32,
  });

  // Generate QR code as data URL
  const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url!);

  // Generate backup codes
  const backupCodes = generateBackupCodes(10);

  return {
    secret: secret.base32,
    qrCodeDataUrl,
    backupCodes,
  };
}

/**
 * Verify a TOTP code against the stored secret
 * @param secret - Base32 encoded secret
 * @param token - 6-digit TOTP code
 * @returns True if the code is valid
 */
export function verifyTOTPCode(secret: string, token: string): boolean {
  try {
    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: TOTP_WINDOW,
    });

    return verified;
  } catch {
    return false;
  }
}

/**
 * Verify MFA code (TOTP or backup code)
 * @param secret - Base32 encoded secret
 * @param code - Code to verify (TOTP or backup)
 * @param backupCodes - Array of valid backup codes
 * @returns Verification result
 */
export function verifyMFACode(
  secret: string,
  code: string,
  backupCodes: string[] = []
): MFAVerificationResult {
  // First, try TOTP verification
  if (isValidTOTPFormat(code)) {
    const verified = verifyTOTPCode(secret, code);
    if (verified) {
      return { valid: true, usedBackupCode: false };
    }
  }

  // Check backup codes (format: XXXX-XXXX)
  if (isValidBackupCodeFormat(code)) {
    const normalizedCode = code.toUpperCase();
    if (backupCodes.includes(normalizedCode)) {
      return { valid: true, usedBackupCode: true };
    }
  }

  return { valid: false, usedBackupCode: false };
}

/**
 * Generate random backup codes
 * @param count - Number of codes to generate
 * @returns Array of backup codes in format XXXX-XXXX
 */
export function generateBackupCodes(count: number = 10): string[] {
  const codes: string[] = [];

  for (let i = 0; i < count; i++) {
    const part1 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const part2 = crypto.randomBytes(2).toString('hex').toUpperCase();
    codes.push(`${part1}-${part2}`);
  }

  return codes;
}

/**
 * Validate TOTP code format (6 digits)
 * @param code - Code to validate
 * @returns True if valid format
 */
export function isValidTOTPFormat(code: string): boolean {
  return /^\d{6}$/.test(code);
}

/**
 * Validate backup code format (XXXX-XXXX)
 * @param code - Code to validate
 * @returns True if valid format
 */
export function isValidBackupCodeFormat(code: string): boolean {
  return /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/.test(code);
}

/**
 * Generate current TOTP for testing/admin purposes
 * @param secret - Base32 encoded secret
 * @returns Current TOTP code
 */
export function generateCurrentTOTP(secret: string): string {
  return speakeasy.totp({
    secret,
    encoding: 'base32',
  });
}

/**
 * Get time remaining until current TOTP expires
 * @returns Seconds remaining
 */
export function getTimeRemaining(): number {
  const epoch = Math.round(Date.now() / 1000);
  return 30 - (epoch % 30);
}
