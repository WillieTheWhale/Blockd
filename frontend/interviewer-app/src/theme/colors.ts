// Blockd Theme - Color System
// Single source of truth for all colors

/**
 * Brand Color Palette
 * Based on the Blockd brand guidelines
 */
export const colors = {
  // Core brand colors - DARK MODE
  void: '#01101B',      // Primary background - black blue
  surface: '#0a1929',   // Cards, panels - slightly lighter
  muted: '#687193',     // Secondary text - slate blue
  accent: '#687193',    // Primary accent - slate blue (more visible)
  light: '#F3F6FB',     // Primary text - egg white
} as const;

/**
 * Risk/Severity Color Palette
 * Harmonized with the blue-gray brand palette
 */
export const riskColors = {
  minimal: '#687193',   // Matches accent - low concern
  low: '#4ADE80',       // Green - good status
  medium: '#FBBF24',    // Amber - warning
  high: '#FB923C',      // Orange - elevated concern
  critical: '#F87171',  // Red - urgent attention needed
} as const;

/**
 * All colors combined for export
 */
export const COLORS = {
  ...colors,
  risk: riskColors,
} as const;

// Type exports for TypeScript consumers
export type BrandColor = keyof typeof colors;
export type RiskLevel = keyof typeof riskColors;
export type ThemeColor = BrandColor | `risk.${RiskLevel}`;
