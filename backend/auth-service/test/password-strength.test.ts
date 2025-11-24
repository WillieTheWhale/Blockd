/**
 * Password Strength Tests
 * Blockd Auth Service
 */

import { describe, expect, test } from '@jest/globals';
import {
  validatePasswordStrength,
  calculatePasswordStrength,
  getPasswordStrengthLabel,
  isCommonPassword
} from '../services/password.service';

describe('Password Strength Validation', () => {
  test('should accept strong password', () => {
    const result = validatePasswordStrength('SecurePass123!@#');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should reject password shorter than 12 characters', () => {
    const result = validatePasswordStrength('Short1!');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('should reject password without uppercase', () => {
    const result = validatePasswordStrength('nocaps123!@#');
    expect(result.valid).toBe(false);
  });

  test('should reject password without lowercase', () => {
    const result = validatePasswordStrength('NOLOWER123!@#');
    expect(result.valid).toBe(false);
  });

  test('should reject password without number', () => {
    const result = validatePasswordStrength('NoNumbers!@#');
    expect(result.valid).toBe(false);
  });

  test('should reject password without special character', () => {
    const result = validatePasswordStrength('NoSpecialChar123');
    expect(result.valid).toBe(false);
  });

  test('should calculate password strength correctly', () => {
    const weakScore = calculatePasswordStrength('weak');
    const strongScore = calculatePasswordStrength('VeryStr0ng!Pass@2024');

    expect(weakScore).toBeLessThan(strongScore);
    expect(strongScore).toBeGreaterThan(60);
  });

  test('should label password strength correctly', () => {
    expect(getPasswordStrengthLabel('weak')).toBe('weak');
    expect(getPasswordStrengthLabel('SecurePass123!@#')).toBe('strong');
  });

  test('should detect common passwords', () => {
    expect(isCommonPassword('password')).toBe(true);
    expect(isCommonPassword('password123')).toBe(true);
    expect(isCommonPassword('MyUn1que!Pass2024')).toBe(false);
  });
});
