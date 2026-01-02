/**
 * Cryptographic Utilities
 * Blockd Auth Service
 */

import crypto from 'crypto';

/**
 * Generate a random token of specified length
 */
export function generateRandomToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Generate a secure random string
 */
export function generateSecureString(length: number = 16): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(length);
  const result: string[] = [];

  for (let i = 0; i < length; i++) {
    result.push(chars[bytes[i] % chars.length]);
  }

  return result.join('');
}

/**
 * Generate backup codes for MFA
 */
export function generateBackupCodes(count: number = 10): string[] {
  const codes: string[] = [];

  for (let i = 0; i < count; i++) {
    // Generate 8-character alphanumeric codes
    const code = generateSecureString(8).toUpperCase();
    // Format as XXXX-XXXX for readability
    const formatted = `${code.slice(0, 4)}-${code.slice(4, 8)}`;
    codes.push(formatted);
  }

  return codes;
}

/**
 * Hash a string using SHA-256
 */
export function hashString(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Create a HMAC signature
 */
export function createHMAC(data: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Verify HMAC signature
 */
export function verifyHMAC(data: string, signature: string, secret: string): boolean {
  const expectedSignature = createHMAC(data, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Encrypt data using AES-256-GCM
 */
export function encrypt(plaintext: string, key: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Combine IV + authTag + encrypted data
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt data using AES-256-GCM
 */
export function decrypt(ciphertext: string, key: string): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Generate a 256-bit encryption key
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create a time-limited token with embedded expiry
 */
export function createTimedToken(data: string, expiryMinutes: number = 60): string {
  const expiry = Date.now() + (expiryMinutes * 60 * 1000);
  const payload = JSON.stringify({ data, expiry });
  const token = Buffer.from(payload).toString('base64url');
  return token;
}

/**
 * Verify and decode a timed token
 */
export function verifyTimedToken(token: string): { data: string; valid: boolean } {
  try {
    const payload = JSON.parse(Buffer.from(token, 'base64url').toString());
    const valid = Date.now() < payload.expiry;
    return { data: payload.data, valid };
  } catch {
    return { data: '', valid: false };
  }
}
