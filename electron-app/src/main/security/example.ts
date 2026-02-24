/**
 * Example usage of Security Monitoring modules
 *
 * This file demonstrates how to integrate and use all security monitoring modules.
 * This is for reference only and should not be imported in production code.
 */

import { BrowserWindow } from 'electron';
import { SecurityMonitor } from './security-monitor';
import { ProcessMonitor } from './process-monitor';
import { VMDetector } from './vm-detector';
import { ScreenRecorderDetector } from './screen-recorder-detector';
import { FocusMonitor } from './focus-monitor';
import { ClipboardMonitor } from './clipboard-monitor';

/**
 * Example 1: Using SecurityMonitor (Recommended - All-in-one solution)
 */
async function exampleSecurityMonitor(window: BrowserWindow): Promise<void> {
  // Create security monitor with custom configuration
  const securityMonitor = new SecurityMonitor({
    checkIntervalMs: 5000, // Check every 5 seconds
    enableProcessMonitoring: true,
    enableVMDetection: true,
    enableScreenRecorderDetection: true,
    enableFocusMonitoring: true,
    enableClipboardMonitoring: true,
    clipboardPollIntervalMs: 500,
  });

  // Register event listener for all security events
  securityMonitor.onSecurityEvent((event) => {
    console.log(`[${event.severity.toUpperCase()}] ${event.type}: ${event.description}`);
    console.log('Metadata:', event.metadata);

    // Handle based on severity
    switch (event.severity) {
      case 'critical':
        // Send immediate alert to backend
        console.error('CRITICAL SECURITY ISSUE:', event);
        break;
      case 'high':
        console.warn('High severity security event:', event);
        break;
      case 'medium':
      case 'low':
        console.info('Security event logged:', event);
        break;
    }
  });

  // Listen for specific event types
  securityMonitor.on('suspicious_process', (event) => {
    console.warn('Suspicious process detected!', event.metadata);
  });

  securityMonitor.on('vm_detected', (event) => {
    console.warn('Virtual machine detected!', event.metadata);
  });

  securityMonitor.on('screen_recording_detected', (event) => {
    console.error('SCREEN RECORDING DETECTED!', event.metadata);
  });

  securityMonitor.on('window_focus_lost', (event) => {
    console.warn('Window focus lost', event.metadata);
  });

  // Start monitoring
  await securityMonitor.start(window);

  // Get current statistics
  const stats = securityMonitor.getStatistics();
  console.log('Security Monitor Statistics:', stats);

  // Force a manual check
  await securityMonitor.forceCheck();

  // Later, when session ends
  // securityMonitor.stop();
}

/**
 * Example 2: Using ProcessMonitor standalone
 */
async function exampleProcessMonitor(): Promise<void> {
  const processMonitor = new ProcessMonitor();

  // Scan for all suspicious processes
  const suspiciousProcesses = await processMonitor.scanForSuspiciousProcesses();

  if (suspiciousProcesses.length > 0) {
    console.log('Found suspicious processes:');
    suspiciousProcesses.forEach((proc) => {
      console.log(`  - ${proc.name} (PID: ${proc.pid}, Category: ${proc.category})`);
    });
  } else {
    console.log('No suspicious processes detected');
  }

  // Check if specific process is running
  const isOBSRunning = await processMonitor.isProcessRunning([/obs/i, /obs64/i]);
  console.log('Is OBS running?', isOBSRunning);
}

/**
 * Example 3: Using VMDetector standalone
 */
async function exampleVMDetector(): Promise<void> {
  const vmDetector = new VMDetector();

  // Run comprehensive VM detection
  const result = await vmDetector.detect();

  console.log('VM Detection Result:');
  console.log('  Is VM:', result.isVM);
  console.log('  VM Type:', result.vmType);
  console.log('  Confidence:', result.confidence);
  console.log('  Detection Methods:', result.detectionMethods);

  // Get detailed system information
  const details = await vmDetector.getSystemDetails();
  console.log('System Details:', {
    manufacturer: details.system.manufacturer,
    model: details.system.model,
    biosVendor: details.bios.vendor,
    macAddresses: details.networkInterfaces.map((iface) => iface.mac),
  });
}

/**
 * Example 4: Using ScreenRecorderDetector standalone
 */
async function exampleScreenRecorderDetector(): Promise<void> {
  const detector = new ScreenRecorderDetector();

  // Detect any screen recorder
  const result = await detector.detect();

  if (result.isRecording) {
    console.warn('SCREEN RECORDING DETECTED!');
    console.warn('Detected recorders:', result.detectedRecorders);
  } else {
    console.log('No screen recording software detected');
  }

  // Platform-specific detection
  const platformResult = await detector.detectPlatformSpecific();
  console.log('Platform-specific result:', platformResult);

  // Check specific recorder
  const isOBSRunning = await detector.isRecorderRunning('obs');
  console.log('Is OBS running?', isOBSRunning);
}

/**
 * Example 5: Using FocusMonitor standalone
 */
function exampleFocusMonitor(window: BrowserWindow): void {
  const focusMonitor = new FocusMonitor();

  // Listen for focus events
  focusMonitor.on('focus-lost', (event) => {
    console.warn(`Focus lost at ${new Date(event.timestamp).toISOString()}`);
    console.warn(`Window was focused for ${event.duration}ms`);
  });

  focusMonitor.on('focus-gained', (event) => {
    console.info(`Focus gained at ${new Date(event.timestamp).toISOString()}`);
    console.info(`Window was unfocused for ${event.duration}ms`);
  });

  focusMonitor.on('window-minimized', () => {
    console.warn('Window was minimized!');
  });

  focusMonitor.on('window-restored', () => {
    console.info('Window was restored');
  });

  // Start monitoring
  focusMonitor.start(window);

  // Check current state
  const stats = focusMonitor.getStatistics();
  console.log('Focus Monitor Statistics:', stats);

  // Later, when done
  // focusMonitor.stop();
}

/**
 * Example 6: Using ClipboardMonitor standalone
 */
function exampleClipboardMonitor(): void {
  const clipboardMonitor = new ClipboardMonitor({
    pollIntervalMs: 500,
    enableTextTracking: true,
    enableImageTracking: true,
    logContent: false, // Don't log actual content for privacy
  });

  // Listen for any clipboard change
  clipboardMonitor.on('clipboard-change', (event) => {
    console.log('Clipboard changed:', {
      type: event.changeType,
      hasText: event.hasText,
      hasImage: event.hasImage,
      textLength: event.textLength,
    });
  });

  // Listen for text changes specifically
  clipboardMonitor.on('clipboard-text-change', (event) => {
    console.log('Text copied/pasted:', event.textLength, 'characters');
  });

  // Listen for image changes
  clipboardMonitor.on('clipboard-image-change', () => {
    console.log('Image copied to clipboard');
  });

  // Listen for clipboard clear
  clipboardMonitor.on('clipboard-cleared', () => {
    console.log('Clipboard was cleared');
  });

  // Start monitoring
  clipboardMonitor.start();

  // Get current state
  const state = clipboardMonitor.getCurrentClipboard();
  console.log('Current clipboard state:', state);

  // Later, when done
  // clipboardMonitor.stop();
}

/**
 * Complete integration example
 */
export async function startSecurityMonitoring(window: BrowserWindow): Promise<SecurityMonitor> {
  console.log('Starting comprehensive security monitoring...');

  // Create and configure security monitor
  const securityMonitor = new SecurityMonitor({
    checkIntervalMs: 5000,
    enableProcessMonitoring: true,
    enableVMDetection: true,
    enableScreenRecorderDetection: true,
    enableFocusMonitoring: true,
    enableClipboardMonitoring: true,
    clipboardPollIntervalMs: 500,
  });

  // Set up event handlers
  securityMonitor.onSecurityEvent((event) => {
    // Log all events
    console.log(`[SECURITY] ${event.severity}: ${event.description}`);

    // Send to backend (pseudo-code)
    // backendConnector.sendSecurityEvent(event);

    // Handle critical events
    if (event.severity === 'critical') {
      console.error('CRITICAL SECURITY EVENT:', event);
      // Maybe end session or alert interviewer
    }
  });

  // Start monitoring
  await securityMonitor.start(window);

  console.log('Security monitoring started successfully');
  return securityMonitor;
}

// Export individual examples for testing
export {
  exampleSecurityMonitor,
  exampleProcessMonitor,
  exampleVMDetector,
  exampleScreenRecorderDetector,
  exampleFocusMonitor,
  exampleClipboardMonitor,
};
