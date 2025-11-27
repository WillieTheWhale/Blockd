import { test, expect, Page } from '@playwright/test';

/**
 * Real-time Features E2E Tests
 *
 * Tests WebSocket functionality including:
 * - WebSocket connection and reconnection
 * - Security event broadcasting
 * - Gaze data streaming
 * - Chat messages
 * - Participant join/leave notifications
 * - Session status updates
 */

test.describe('Real-time Features', () => {
  let interviewerPage: Page;
  let intervieweePage: Page;
  let sessionId: string;

  test.beforeEach(async ({ browser }) => {
    // Create separate contexts for interviewer and interviewee
    const interviewerContext = await browser.newContext();
    const intervieweeContext = await browser.newContext();

    interviewerPage = await interviewerContext.newPage();
    intervieweePage = await intervieweeContext.newPage();

    // Setup: Login as interviewer and create a session
    await interviewerPage.goto('/login');
    await interviewerPage.fill('input[name="email"]', 'interviewer@blockd.test');
    await interviewerPage.fill('input[name="password"]', 'Test123456!');
    await interviewerPage.click('button[type="submit"]');
    await interviewerPage.waitForURL('/dashboard');

    // Create session
    await interviewerPage.click('button:has-text("New Session")');
    await interviewerPage.fill('input[name="title"]', 'Realtime Test Session');
    await interviewerPage.fill('input[name="candidateName"]', 'Realtime Candidate');
    await interviewerPage.fill('input[name="candidateEmail"]', 'realtime@test.com');
    await interviewerPage.click('button[type="submit"]:has-text("Create")');

    // Get session ID and invite link
    await interviewerPage.click('.session-card:has-text("Realtime Test Session")');
    sessionId = await interviewerPage.getAttribute('[data-session-id]', 'data-session-id') || '';

    // Start session
    await interviewerPage.click('button:has-text("Start Session")');
  });

  test.afterEach(async () => {
    await interviewerPage?.close();
    await intervieweePage?.close();
  });

  test('should establish WebSocket connection', async () => {
    // Verify WebSocket connected on interviewer side
    await expect(interviewerPage.locator('.ws-status')).toHaveAttribute(
      'data-status',
      'connected',
      { timeout: 5000 }
    );

    // Check connection indicator
    await expect(interviewerPage.locator('.connection-indicator')).toHaveClass(/connected/);

    // Verify WebSocket URL is correct
    const wsUrl = await interviewerPage.evaluate(() => {
      return (window as any).__WS_URL__;
    });

    expect(wsUrl).toMatch(/^wss?:\/\/.+\/ws/);
  });

  test('should handle WebSocket reconnection after disconnect', async () => {
    // Wait for initial connection
    await expect(interviewerPage.locator('.ws-status')).toHaveAttribute(
      'data-status',
      'connected'
    );

    // Simulate network disconnection
    await interviewerPage.context().setOffline(true);

    // Verify disconnection is detected
    await expect(interviewerPage.locator('.ws-status')).toHaveAttribute(
      'data-status',
      'disconnected',
      { timeout: 5000 }
    );

    await expect(interviewerPage.locator('.reconnecting-indicator')).toBeVisible();

    // Restore network
    await interviewerPage.context().setOffline(false);

    // Verify automatic reconnection
    await expect(interviewerPage.locator('.ws-status')).toHaveAttribute(
      'data-status',
      'connected',
      { timeout: 10000 }
    );

    await expect(interviewerPage.locator('.reconnecting-indicator')).not.toBeVisible();
    await expect(interviewerPage.locator('.toast-success')).toContainText('Reconnected');
  });

  test('should broadcast security events in real-time', async () => {
    // Get invite link and join as interviewee
    const inviteLink = await interviewerPage.getAttribute(
      '[data-invite-link]',
      'data-invite-link'
    ) || '';

    await intervieweePage.goto(inviteLink);
    await intervieweePage.fill('input[name="name"]', 'Realtime Candidate');
    await intervieweePage.click('button:has-text("Join Session")');

    // Wait for WebSocket connection
    await expect(intervieweePage.locator('.ws-status')).toHaveAttribute(
      'data-status',
      'connected'
    );

    // Simulate security event - window blur (interviewee loses focus)
    await intervieweePage.evaluate(() => {
      window.dispatchEvent(new Event('blur'));
    });

    // Wait a moment for event to propagate
    await interviewerPage.waitForTimeout(1500);

    // Verify interviewer receives the security event in real-time
    await expect(interviewerPage.locator('.security-event-notification')).toBeVisible({
      timeout: 5000,
    });

    await expect(interviewerPage.locator('.security-event-notification')).toContainText(
      'Window lost focus'
    );

    // Verify event appears in the security events list
    await interviewerPage.click('button:has-text("Security Events")');
    await expect(interviewerPage.locator('.security-events-panel')).toBeVisible();
    await expect(interviewerPage.locator('.security-event-item')).toContainText(
      'Window lost focus'
    );

    // Simulate another security event - multiple monitors detected
    await intervieweePage.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('security-event', {
          detail: { type: 'multiple_monitors', severity: 'medium' },
        })
      );
    });

    await interviewerPage.waitForTimeout(1500);

    // Verify second event received
    const eventCount = await interviewerPage.locator('.security-event-item').count();
    expect(eventCount).toBeGreaterThanOrEqual(2);
  });

  test('should stream gaze data in real-time', async () => {
    // Join as interviewee
    const inviteLink = await interviewerPage.getAttribute(
      '[data-invite-link]',
      'data-invite-link'
    ) || '';

    await intervieweePage.goto(inviteLink);
    await intervieweePage.fill('input[name="name"]', 'Realtime Candidate');
    await intervieweePage.click('button:has-text("Join Session")');

    await expect(intervieweePage.locator('.ws-status')).toHaveAttribute(
      'data-status',
      'connected'
    );

    // Verify gaze tracking is active
    await expect(interviewerPage.locator('.gaze-tracking-status')).toHaveAttribute(
      'data-status',
      'active'
    );

    // Simulate gaze data from interviewee
    await intervieweePage.evaluate(() => {
      // Simulate eye tracking data
      const gazeData = {
        x: 0.5,
        y: 0.3,
        timestamp: Date.now(),
        confidence: 0.95,
      };

      (window as any).__sendGazeData__(gazeData);
    });

    await interviewerPage.waitForTimeout(1000);

    // Verify gaze data is received and rendered on heatmap
    const heatmapData = await interviewerPage.evaluate(() => {
      return (window as any).__getHeatmapData__?.();
    });

    expect(heatmapData).toBeDefined();
  });

  test('should send and receive chat messages', async () => {
    // Join as interviewee
    const inviteLink = await interviewerPage.getAttribute(
      '[data-invite-link]',
      'data-invite-link'
    ) || '';

    await intervieweePage.goto(inviteLink);
    await intervieweePage.fill('input[name="name"]', 'Realtime Candidate');
    await intervieweePage.click('button:has-text("Join Session")');

    await expect(intervieweePage.locator('.ws-status')).toHaveAttribute(
      'data-status',
      'connected'
    );

    // Open chat on both sides
    await interviewerPage.click('button[data-chat-toggle]');
    await intervieweePage.click('button[data-chat-toggle]');

    await expect(interviewerPage.locator('.chat-panel')).toBeVisible();
    await expect(intervieweePage.locator('.chat-panel')).toBeVisible();

    // Interviewer sends a message
    const interviewerMessage = 'Hello, can you hear me?';
    await interviewerPage.fill('textarea[name="chatMessage"]', interviewerMessage);
    await interviewerPage.click('button:has-text("Send")');

    // Verify message appears on interviewer side
    await expect(interviewerPage.locator('.chat-message.sent')).toContainText(
      interviewerMessage
    );

    // Verify message received on interviewee side
    await expect(intervieweePage.locator('.chat-message.received')).toContainText(
      interviewerMessage,
      { timeout: 3000 }
    );

    // Interviewee responds
    const intervieweeMessage = 'Yes, I can hear you clearly!';
    await intervieweePage.fill('textarea[name="chatMessage"]', intervieweeMessage);
    await intervieweePage.click('button:has-text("Send")');

    // Verify response appears on interviewee side
    await expect(intervieweePage.locator('.chat-message.sent')).toContainText(
      intervieweeMessage
    );

    // Verify response received on interviewer side
    await expect(interviewerPage.locator('.chat-message.received')).toContainText(
      intervieweeMessage,
      { timeout: 3000 }
    );

    // Verify message count
    const interviewerMessageCount = await interviewerPage.locator('.chat-message').count();
    const intervieweeMessageCount = await intervieweePage.locator('.chat-message').count();

    expect(interviewerMessageCount).toBe(2);
    expect(intervieweeMessageCount).toBe(2);
  });

  test('should notify when participant joins or leaves', async () => {
    // Get invite link
    const inviteLink = await interviewerPage.getAttribute(
      '[data-invite-link]',
      'data-invite-link'
    ) || '';

    // Monitor for join notifications
    const joinNotificationPromise = interviewerPage.waitForSelector(
      '.participant-notification:has-text("joined")',
      { timeout: 5000 }
    );

    // Interviewee joins
    await intervieweePage.goto(inviteLink);
    await intervieweePage.fill('input[name="name"]', 'Realtime Candidate');
    await intervieweePage.click('button:has-text("Join Session")');

    // Verify join notification on interviewer side
    await joinNotificationPromise;
    await expect(interviewerPage.locator('.participant-notification')).toContainText(
      'Realtime Candidate joined the session'
    );

    // Verify participant count updated
    await expect(interviewerPage.locator('.participant-count')).toContainText('2');

    // Monitor for leave notifications
    const leaveNotificationPromise = interviewerPage.waitForSelector(
      '.participant-notification:has-text("left")',
      { timeout: 5000 }
    );

    // Interviewee leaves
    await intervieweePage.close();

    // Verify leave notification
    await leaveNotificationPromise;
    await expect(interviewerPage.locator('.participant-notification')).toContainText(
      'Realtime Candidate left the session'
    );

    // Verify participant count updated
    await expect(interviewerPage.locator('.participant-count')).toContainText('1');
  });

  test('should update session status in real-time', async () => {
    // Join as interviewee
    const inviteLink = await interviewerPage.getAttribute(
      '[data-invite-link]',
      'data-invite-link'
    ) || '';

    await intervieweePage.goto(inviteLink);
    await intervieweePage.fill('input[name="name"]', 'Realtime Candidate');
    await intervieweePage.click('button:has-text("Join Session")');

    await expect(intervieweePage.locator('.ws-status')).toHaveAttribute(
      'data-status',
      'connected'
    );

    // Verify both see "In Progress" status
    await expect(interviewerPage.locator('.session-status')).toContainText('In Progress');
    await expect(intervieweePage.locator('.session-status')).toContainText('In Progress');

    // Interviewer pauses the session
    await interviewerPage.click('button:has-text("Pause Session")');

    // Verify status updated on both sides
    await expect(interviewerPage.locator('.session-status')).toContainText('Paused');
    await expect(intervieweePage.locator('.session-status')).toContainText('Paused', {
      timeout: 3000,
    });

    // Resume session
    await interviewerPage.click('button:has-text("Resume Session")');

    // Verify status updated
    await expect(interviewerPage.locator('.session-status')).toContainText('In Progress');
    await expect(intervieweePage.locator('.session-status')).toContainText('In Progress', {
      timeout: 3000,
    });

    // End session
    await interviewerPage.click('button:has-text("End Session")');
    await interviewerPage.click('button:has-text("Confirm")');

    // Verify status updated to Completed
    await expect(interviewerPage.locator('.session-status')).toContainText('Completed');
    await expect(intervieweePage.locator('.session-status')).toContainText('Completed', {
      timeout: 3000,
    });

    // Verify interviewee sees session ended screen
    await expect(intervieweePage.locator('.session-ended')).toBeVisible();
  });

  test('should handle multiple WebSocket events simultaneously', async () => {
    // Join as interviewee
    const inviteLink = await interviewerPage.getAttribute(
      '[data-invite-link]',
      'data-invite-link'
    ) || '';

    await intervieweePage.goto(inviteLink);
    await intervieweePage.fill('input[name="name"]', 'Realtime Candidate');
    await intervieweePage.click('button:has-text("Join Session")');

    await expect(intervieweePage.locator('.ws-status')).toHaveAttribute(
      'data-status',
      'connected'
    );

    // Trigger multiple events simultaneously
    await Promise.all([
      // Send chat message
      (async () => {
        await intervieweePage.click('button[data-chat-toggle]');
        await intervieweePage.fill('textarea[name="chatMessage"]', 'Multiple events test');
        await intervieweePage.click('button:has-text("Send")');
      })(),

      // Trigger security event
      intervieweePage.evaluate(() => {
        window.dispatchEvent(new Event('blur'));
      }),

      // Send gaze data
      intervieweePage.evaluate(() => {
        (window as any).__sendGazeData__?.({
          x: 0.5,
          y: 0.5,
          timestamp: Date.now(),
          confidence: 0.9,
        });
      }),
    ]);

    // Wait for all events to propagate
    await interviewerPage.waitForTimeout(2000);

    // Verify all events were processed
    await interviewerPage.click('button[data-chat-toggle]');
    await expect(interviewerPage.locator('.chat-message')).toContainText('Multiple events test');

    // Verify no errors occurred
    const errorCount = await interviewerPage.locator('.error-notification').count();
    expect(errorCount).toBe(0);
  });
});
