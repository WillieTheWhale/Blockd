/**
 * MFA Service
 * Handles TOTP generation and verification
 * Blockd Auth Service
 */

import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { timingSafeEqual } from 'crypto';
import { generateBackupCodes, encrypt, decrypt } from '../lib/crypto';
import { InvalidMFACodeError } from '../lib/errors';
import { BackupCode } from '../types/user.types';

/**
 * Constant-time string comparison to prevent timing attacks
 * @param a First string to compare
 * @param b Second string to compare
 * @returns True if strings are equal
 */
function constantTimeCompare(a: string, b: string): boolean {
  // Normalize inputs to uppercase for case-insensitive comparison
  const normalizedA = a.toUpperCase();
  const normalizedB = b.toUpperCase();

  // If lengths differ, still perform comparison to prevent timing leak
  // But we'll return false at the end
  const lengthsMatch = normalizedA.length === normalizedB.length;

  // Pad shorter string to match length (prevents timing leak from early return)
  const maxLen = Math.max(normalizedA.length, normalizedB.length);
  const paddedA = normalizedA.padEnd(maxLen, '\0');
  const paddedB = normalizedB.padEnd(maxLen, '\0');

  try {
    const result = timingSafeEqual(
      Buffer.from(paddedA, 'utf8'),
      Buffer.from(paddedB, 'utf8')
    );
    return result && lengthsMatch;
  } catch {
    // If timingSafeEqual throws (shouldn't happen with padding), return false
    return false;
  }
}

const APP_NAME = 'Blockd';
const ENCRYPTION_KEY = process.env.MFA_ENCRYPTION_KEY || '';

/**
 * Generate MFA secret for user
 */
export async function generateMFASecret(email: string): Promise<{
  secret: string;
  qr_code_url: string;
  backup_codes: string[];
}> {
  // Generate secret
  const secret = speakeasy.generateSecret({
    name: `${APP_NAME} (${email})`,
    issuer: APP_NAME,
    length: 32
  });

  // Generate QR code
  const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

  // Generate backup codes
  const backupCodes = generateBackupCodes(10);

  return {
    secret: secret.base32,
    qr_code_url: qrCodeUrl,
    backup_codes: backupCodes
  };
}

/**
 * Verify TOTP code
 */
export function verifyTOTPCode(secret: string, code: string): boolean {
  const verified = speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token: code,
    window: 2 // Allow 2 time steps before and after
  });

  return verified;
}

/**
 * Verify MFA code (TOTP or backup code)
 */
export async function verifyMFACode(
  encryptedSecret: string,
  code: string,
  encryptedBackupCodes?: string
): Promise<{ valid: boolean; usedBackupCode: boolean }> {
  // Decrypt the secret
  let secret: string;
  try {
    secret = decrypt(encryptedSecret, ENCRYPTION_KEY);
  } catch {
    throw new InvalidMFACodeError('Failed to decrypt MFA secret');
  }

  // First, try to verify as TOTP code
  const totpValid = verifyTOTPCode(secret, code);
  if (totpValid) {
    return { valid: true, usedBackupCode: false };
  }

  // If TOTP failed and backup codes exist, check backup codes
  if (encryptedBackupCodes) {
    try {
      const backupCodesJson = decrypt(encryptedBackupCodes, ENCRYPTION_KEY);
      const backupCodes: BackupCode[] = JSON.parse(backupCodesJson);

      // Check if code matches an unused backup code using constant-time comparison
      // This prevents timing attacks that could leak information about valid backup codes
      let matchingCode: BackupCode | undefined;
      for (const bc of backupCodes) {
        // Use constant-time comparison to prevent timing attacks
        if (!bc.used && constantTimeCompare(bc.code, code)) {
          matchingCode = bc;
          // Don't break early - continue checking all codes to prevent timing leak
        }
      }

      if (matchingCode) {
        return { valid: true, usedBackupCode: true };
      }
    } catch {
      // Backup codes decryption failed, continue
    }
  }

  return { valid: false, usedBackupCode: false };
}

/**
 * Encrypt MFA secret for storage
 */
export function encryptMFASecret(secret: string): string {
  if (!ENCRYPTION_KEY) {
    throw new Error('MFA_ENCRYPTION_KEY not configured');
  }
  return encrypt(secret, ENCRYPTION_KEY);
}

/**
 * Decrypt MFA secret
 */
export function decryptMFASecret(encryptedSecret: string): string {
  if (!ENCRYPTION_KEY) {
    throw new Error('MFA_ENCRYPTION_KEY not configured');
  }
  return decrypt(encryptedSecret, ENCRYPTION_KEY);
}

/**
 * Encrypt backup codes for storage
 */
export function encryptBackupCodes(backupCodes: string[]): string {
  if (!ENCRYPTION_KEY) {
    throw new Error('MFA_ENCRYPTION_KEY not configured');
  }

  const codes: BackupCode[] = backupCodes.map(code => ({
    code,
    used: false
  }));

  return encrypt(JSON.stringify(codes), ENCRYPTION_KEY);
}

/**
 * Mark backup code as used
 */
export function markBackupCodeUsed(
  encryptedBackupCodes: string,
  usedCode: string
): string {
  if (!ENCRYPTION_KEY) {
    throw new Error('MFA_ENCRYPTION_KEY not configured');
  }

  const backupCodesJson = decrypt(encryptedBackupCodes, ENCRYPTION_KEY);
  const backupCodes: BackupCode[] = JSON.parse(backupCodesJson);

  // Find and mark the code as used
  const code = backupCodes.find(bc => bc.code === usedCode.toUpperCase());
  if (code) {
    code.used = true;
    code.used_at = new Date();
  }

  return encrypt(JSON.stringify(backupCodes), ENCRYPTION_KEY);
}

/**
 * Get remaining backup codes
 */
export function getRemainingBackupCodes(encryptedBackupCodes: string): number {
  if (!ENCRYPTION_KEY) {
    throw new Error('MFA_ENCRYPTION_KEY not configured');
  }

  try {
    const backupCodesJson = decrypt(encryptedBackupCodes, ENCRYPTION_KEY);
    const backupCodes: BackupCode[] = JSON.parse(backupCodesJson);
    return backupCodes.filter(bc => !bc.used).length;
  } catch {
    return 0;
  }
}

/**
 * Generate new backup codes (when running low)
 */
export function regenerateBackupCodes(): string[] {
  return generateBackupCodes(10);
}

/**
 * Validate MFA code format
 */
export function isValidMFACodeFormat(code: string): boolean {
  // TOTP codes are 6 digits
  if (/^\d{6}$/.test(code)) {
    return true;
  }

  // Backup codes are in format XXXX-XXXX
  if (/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code.toUpperCase())) {
    return true;
  }

  return false;
}

/**
 * Generate current TOTP code (for testing/admin purposes)
 */
export function generateCurrentTOTP(secret: string): string {
  return speakeasy.totp({
    secret,
    encoding: 'base32'
  });
}
