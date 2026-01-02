import { test, expect, Page } from '@playwright/test';

/**
 * Complete Interview Flow E2E Test
 *
 * This test validates the entire interview lifecycle from creation to report generation.
 * Steps:
 * 1. Interviewer logs in
 * 2. Creates new interview session
 * 3. Invites interviewee
 * 4. Starts session
 * 5. Interviewee joins (simulated)
 * 6. Questions are asked and answered
 * 7. Security events are monitored
 * 8. Gaze tracking is active
 * 9. Session ends
 * 10. Report is generated
 */

test.describe('Complete Interview Flow', () => {
  let interviewerPage: Page;
  let intervieweePage: Page;
  let sessionId: string;
  let inviteLink: string;

  test.beforeEach(async ({ browser }) => {
    // Create separate contexts for interviewer and interviewee
    const interviewerContext = await browser.newContext();
    const intervieweeContext = await browser.newContext();

    interviewerPage = await interviewerContext.newPage();
    intervieweePage = await intervieweeContext.newPage();
  });

  test.afterEach(async () => {
    await interviewerPage?.close();
    await intervieweePage?.close();
  });

  test('should complete full interview workflow', async () => {
    // Step 1: Interviewer logs in
    await interviewerPage.goto('/login');
    await interviewerPage.fill('input[name="email"]', 'interviewer@blockd.test');
    await interviewerPage.fill('input[name="password"]', 'Test123456!');
    await interviewerPage.click('button[type="submit"]');

    await expect(interviewerPage).toHaveURL('/dashboard');
    await expect(interviewerPage.locator('h1')).toContainText('Dashboard');

    // Step 2: Create new interview session
    await interviewerPage.click('button:has-text("New Session")');
    await interviewerPage.fill('input[name="title"]', 'E2E Test Interview');
    await interviewerPage.fill('input[name="candidateName"]', 'Test Candidate');
    await interviewerPage.fill('input[name="candidateEmail"]', 'candidate@test.com');
    await interviewerPage.fill('input[name="position"]', 'Senior Developer');
    await interviewerPage.click('button[type="submit"]:has-text("Create")');

    // Verify session created successfully
    await expect(interviewerPage.locator('.toast-success')).toBeVisible();
    await expect(interviewerPage.locator('.session-card')).toContainText('E2E Test Interview');

    // Step 3: Get invite link
    await interviewerPage.click('.session-card:has-text("E2E Test Interview")');
    sessionId = await interviewerPage.getAttribute('[data-session-id]', 'data-session-id') || '';
    expect(sessionId).toBeTruthy();

    const inviteLinkElement = interviewerPage.locator('[data-invite-link]');
    inviteLink = await inviteLinkElement.getAttribute('data-invite-link') || '';
    expect(inviteLink).toBeTruthy();

    // Step 4: Start session
    await interviewerPage.click('button:has-text("Start Session")');
    await expect(interviewerPage.locator('.session-status')).toContainText('In Progress');

    // Verify WebSocket connection established
    await expect(interviewerPage.locator('.ws-status')).toHaveAttribute('data-status', 'connected');

    // Step 5: Interviewee joins
    await intervieweePage.goto(inviteLink);
    await intervieweePage.fill('input[name="name"]', 'Test Candidate');
    await intervieweePage.click('button:has-text("Join Session")');

    // Wait for video permissions
    await intervieweePage.waitForTimeout(2000);

    // Verify interviewee video stream is active
    await expect(intervieweePage.locator('video[data-stream-type="local"]')).toBeVisible();

    // Verify interviewer sees the interviewee joined
    await expect(interviewerPage.locator('.participant-joined')).toBeVisible();
    await expect(interviewerPage.locator('video[data-stream-type="remote"]')).toBeVisible();

    // Step 6: Ask and answer questions
    // Interviewer asks a question
    await interviewerPage.click('button:has-text("Next Question")');
    const question = await interviewerPage.locator('.current-question').textContent();
    expect(question).toBeTruthy();

    // Verify interviewee sees the question
    await expect(intervieweePage.locator('.question-display')).toContainText(question!);

    // Interviewee provides an answer (simulated typing)
    await intervieweePage.click('textarea[name="answer"]');
    const answer = 'This is a test answer to demonstrate the interview flow functionality.';
    await intervieweePage.fill('textarea[name="answer"]', answer);
    await intervieweePage.click('button:has-text("Submit Answer")');

    // Verify answer submitted
    await expect(intervieweePage.locator('.toast-success')).toContainText('Answer submitted');

    // Verify interviewer sees the answer
    await expect(interviewerPage.locator('.answer-display')).toContainText(answer);

    // Step 7: Verify security events are monitored
    // Check that security monitoring is active
    await expect(interviewerPage.locator('.security-monitor')).toHaveAttribute(
      'data-status',
      'active'
    );

    // Simulate a security event (window blur)
    await intervieweePage.evaluate(() => {
      window.dispatchEvent(new Event('blur'));
    });

    // Wait for event to propagate
    await interviewerPage.waitForTimeout(1000);

    // Verify security event logged
    await expect(interviewerPage.locator('.security-event')).toBeVisible();
    await expect(interviewerPage.locator('.security-event')).toContainText('Window lost focus');

    // Step 8: Verify gaze tracking is active
    await expect(interviewerPage.locator('.gaze-tracking-status')).toHaveAttribute(
      'data-status',
      'active'
    );

    // Verify gaze heatmap is being rendered
    await expect(interviewerPage.locator('canvas[data-heatmap]')).toBeVisible();

    // Step 9: End session
    await interviewerPage.click('button:has-text("End Session")');
    await interviewerPage.click('button:has-text("Confirm")');

    // Verify session ended
    await expect(interviewerPage.locator('.session-status')).toContainText('Completed');

    // Verify interviewee sees session ended message
    await expect(intervieweePage.locator('.session-ended')).toBeVisible();
    await expect(intervieweePage.locator('.session-ended')).toContainText(
      'The interview has ended'
    );

    // Step 10: Verify report is generated
    await interviewerPage.click('button:has-text("View Report")');
    await expect(interviewerPage).toHaveURL(/\/reports\/\w+/);

    // Verify report contains all required data
    await expect(interviewerPage.locator('.report-header')).toContainText('E2E Test Interview');
    await expect(interviewerPage.locator('.candidate-name')).toContainText('Test Candidate');

    // Verify sections exist
    await expect(interviewerPage.locator('.report-section.overview')).toBeVisible();
    await expect(interviewerPage.locator('.report-section.answers')).toBeVisible();
    await expect(interviewerPage.locator('.report-section.security')).toBeVisible();
    await expect(interviewerPage.locator('.report-section.ai-detection')).toBeVisible();
    await expect(interviewerPage.locator('.report-section.gaze-analysis')).toBeVisible();

    // Verify answer is in report
    await expect(interviewerPage.locator('.answer-text')).toContainText(answer);

    // Verify security events are in report
    await expect(interviewerPage.locator('.security-events-list')).toContainText(
      'Window lost focus'
    );

    // Verify AI detection analysis exists
    await expect(interviewerPage.locator('.ai-risk-score')).toBeVisible();

    // Verify gaze analysis exists
    await expect(interviewerPage.locator('.gaze-heatmap-report')).toBeVisible();
  });

  test('should handle session cancellation', async () => {
    // Login as interviewer
    await interviewerPage.goto('/login');
    await interviewerPage.fill('input[name="email"]', 'interviewer@blockd.test');
    await interviewerPage.fill('input[name="password"]', 'Test123456!');
    await interviewerPage.click('button[type="submit"]');

    // Create session
    await interviewerPage.click('button:has-text("New Session")');
    await interviewerPage.fill('input[name="title"]', 'Cancelled Session');
    await interviewerPage.fill('input[name="candidateName"]', 'Cancelled Candidate');
    await interviewerPage.fill('input[name="candidateEmail"]', 'cancelled@test.com');
    await interviewerPage.click('button[type="submit"]:has-text("Create")');

    // Click on the session
    await interviewerPage.click('.session-card:has-text("Cancelled Session")');

    // Cancel the session
    await interviewerPage.click('button:has-text("Cancel Session")');
    await interviewerPage.click('button:has-text("Confirm")');

    // Verify session is cancelled
    await expect(interviewerPage.locator('.session-status')).toContainText('Cancelled');

    // Verify user is redirected back to dashboard
    await expect(interviewerPage).toHaveURL('/dashboard');
  });

  test('should handle network interruption gracefully', async () => {
    // Login and create session
    await interviewerPage.goto('/login');
    await interviewerPage.fill('input[name="email"]', 'interviewer@blockd.test');
    await interviewerPage.fill('input[name="password"]', 'Test123456!');
    await interviewerPage.click('button[type="submit"]');

    await interviewerPage.click('button:has-text("New Session")');
    await interviewerPage.fill('input[name="title"]', 'Network Test');
    await interviewerPage.fill('input[name="candidateName"]', 'Network Candidate');
    await interviewerPage.fill('input[name="candidateEmail"]', 'network@test.com');
    await interviewerPage.click('button[type="submit"]:has-text("Create")');

    await interviewerPage.click('.session-card:has-text("Network Test")');
    await interviewerPage.click('button:has-text("Start Session")');

    // Verify connection is established
    await expect(interviewerPage.locator('.ws-status')).toHaveAttribute('data-status', 'connected');

    // Simulate network interruption
    await interviewerPage.context().setOffline(true);

    // Verify reconnection indicator appears
    await expect(interviewerPage.locator('.reconnecting-indicator')).toBeVisible();

    // Restore network
    await interviewerPage.context().setOffline(false);

    // Verify reconnection successful
    await expect(interviewerPage.locator('.ws-status')).toHaveAttribute(
      'data-status',
      'connected',
      { timeout: 10000 }
    );
    await expect(interviewerPage.locator('.reconnecting-indicator')).not.toBeVisible();
  });
});
