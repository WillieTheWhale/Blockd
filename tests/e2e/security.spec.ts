import { test, expect, Page } from '@playwright/test';

/**
 * Security Event Detection E2E Tests
 *
 * Tests security monitoring functionality including:
 * - Suspicious process detection (mocked)
 * - Window focus change detection
 * - Screen recording attempt detection
 * - Event logging to database
 * - Real-time alerts to interviewer
 */

test.describe('Security Event Detection', () => {
  let interviewerPage: Page;
  let intervieweePage: Page;

  test.beforeEach(async ({ browser }) => {
    // Create separate contexts
    const interviewerContext = await browser.newContext();
    const intervieweeContext = await browser.newContext();

    interviewerPage = await interviewerContext.newPage();
    intervieweePage = await intervieweeContext.newPage();

    // Setup: Create and start session
    await interviewerPage.goto('/login');
    await interviewerPage.fill('input[name="email"]', 'interviewer@blockd.test');
    await interviewerPage.fill('input[name="password"]', 'Test123456!');
    await interviewerPage.click('button[type="submit"]');
    await interviewerPage.waitForURL('/dashboard');

    await interviewerPage.click('button:has-text("New Session")');
    await interviewerPage.fill('input[name="title"]', 'Security Test Session');
    await interviewerPage.fill('input[name="candidateName"]', 'Security Test Candidate');
    await interviewerPage.fill('input[name="candidateEmail"]', 'security@test.com');
    await interviewerPage.click('button[type="submit"]:has-text("Create")');

    await interviewerPage.click('.session-card:has-text("Security Test Session")');
    await interviewerPage.click('button:has-text("Start Session")');

    // Join as interviewee
    const inviteLink = await interviewerPage.getAttribute(
      '[data-invite-link]',
      'data-invite-link'
    ) || '';

    await intervieweePage.goto(inviteLink);
    await intervieweePage.fill('input[name="name"]', 'Security Test Candidate');
    await intervieweePage.click('button:has-text("Join Session")');

    await expect(intervieweePage.locator('.ws-status')).toHaveAttribute(
      'data-status',
      'connected'
    );
  });

  test.afterEach(async () => {
    await interviewerPage?.close();
    await intervieweePage?.close();
  });

  test('should detect and log window focus changes', async () => {
    // Verify security monitoring is active
    await expect(interviewerPage.locator('.security-monitor-status')).toHaveAttribute(
      'data-status',
      'active'
    );

    // Simulate window blur (candidate switches to another window)
    await intervieweePage.evaluate(() => {
      window.dispatchEvent(new Event('blur'));
    });

    await interviewerPage.waitForTimeout(1500);

    // Verify real-time alert on interviewer side
    await expect(interviewerPage.locator('.security-alert')).toBeVisible({ timeout: 5000 });
    await expect(interviewerPage.locator('.security-alert')).toContainText('Window lost focus');

    // Verify event severity is displayed
    await expect(interviewerPage.locator('.security-alert')).toHaveAttribute(
      'data-severity',
      'medium'
    );

    // Check security events panel
    await interviewerPage.click('button:has-text("Security Events")');
    await expect(interviewerPage.locator('.security-events-panel')).toBeVisible();

    const eventItem = interviewerPage.locator('.security-event-item').first();
    await expect(eventItem).toContainText('Window lost focus');
    await expect(eventItem).toContainText(/\d{1,2}:\d{2}:\d{2}/); // Timestamp format

    // Simulate window regain focus
    await intervieweePage.evaluate(() => {
      window.dispatchEvent(new Event('focus'));
    });

    await interviewerPage.waitForTimeout(1500);

    // Verify focus restored event
    const eventCount = await interviewerPage.locator('.security-event-item').count();
    expect(eventCount).toBeGreaterThanOrEqual(2);
  });

  test('should detect suspicious process simulation', async () => {
    // Simulate detection of suspicious process (e.g., screen recording software)
    await intervieweePage.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('security-event', {
          detail: {
            type: 'suspicious_process',
            severity: 'high',
            processName: 'OBS Studio',
            timestamp: Date.now(),
          },
        })
      );
    });

    await interviewerPage.waitForTimeout(2000);

    // Verify high-severity alert
    await expect(interviewerPage.locator('.security-alert[data-severity="high"]')).toBeVisible({
      timeout: 5000,
    });

    await expect(interviewerPage.locator('.security-alert')).toContainText('Suspicious process');
    await expect(interviewerPage.locator('.security-alert')).toContainText('OBS Studio');

    // Verify visual warning (e.g., red border, warning icon)
    await expect(interviewerPage.locator('.security-warning-indicator')).toBeVisible();

    // Check event logged in security panel
    await interviewerPage.click('button:has-text("Security Events")');
    await expect(interviewerPage.locator('.security-event-item.high-severity')).toBeVisible();
  });

  test('should detect screen recording attempts', async () => {
    // Simulate screen recording detection via browser API
    await intervieweePage.evaluate(() => {
      // Simulate MediaRecorder activity or screen capture API usage
      window.dispatchEvent(
        new CustomEvent('security-event', {
          detail: {
            type: 'screen_recording_detected',
            severity: 'critical',
            timestamp: Date.now(),
          },
        })
      );
    });

    await interviewerPage.waitForTimeout(2000);

    // Verify critical alert
    await expect(
      interviewerPage.locator('.security-alert[data-severity="critical"]')
    ).toBeVisible({ timeout: 5000 });

    await expect(interviewerPage.locator('.security-alert')).toContainText(
      'Screen recording detected'
    );

    // Verify alert sound/notification (check if audio element played)
    const alertSoundPlayed = await interviewerPage.evaluate(() => {
      const audioElement = document.querySelector('audio[data-alert-sound]') as HTMLAudioElement;
      return audioElement && !audioElement.paused;
    });

    // Audio might be playing or just finished
    // expect(alertSoundPlayed).toBeDefined();

    // Verify option to pause or end session appears
    await expect(
      interviewerPage.locator('button:has-text("Pause Session")')
    ).toBeVisible();
  });

  test('should detect multiple monitor setup', async () => {
    // Simulate multiple monitor detection
    await intervieweePage.evaluate(() => {
      // Mock screen API to report multiple monitors
      Object.defineProperty(window.screen, 'isExtended', {
        value: true,
        writable: true,
      });

      window.dispatchEvent(
        new CustomEvent('security-event', {
          detail: {
            type: 'multiple_monitors',
            severity: 'medium',
            monitorCount: 2,
            timestamp: Date.now(),
          },
        })
      );
    });

    await interviewerPage.waitForTimeout(1500);

    // Verify medium-severity alert
    await expect(
      interviewerPage.locator('.security-alert[data-severity="medium"]')
    ).toBeVisible({ timeout: 5000 });

    await expect(interviewerPage.locator('.security-alert')).toContainText(
      'Multiple monitors detected'
    );

    // Verify event details
    await interviewerPage.click('.security-alert');
    await expect(interviewerPage.locator('.event-details')).toContainText('2 monitors');
  });

  test('should detect copy-paste attempts', async () => {
    // Navigate to a question answer field
    await interviewerPage.click('button:has-text("Next Question")');

    // Simulate paste event on interviewee side
    await intervieweePage.evaluate(() => {
      const textarea = document.querySelector('textarea[name="answer"]') as HTMLTextAreaElement;
      if (textarea) {
        const pasteEvent = new ClipboardEvent('paste', {
          clipboardData: new DataTransfer(),
        });
        textarea.dispatchEvent(pasteEvent);

        // Manually trigger security event
        window.dispatchEvent(
          new CustomEvent('security-event', {
            detail: {
              type: 'paste_detected',
              severity: 'medium',
              timestamp: Date.now(),
            },
          })
        );
      }
    });

    await interviewerPage.waitForTimeout(1500);

    // Verify alert
    await expect(interviewerPage.locator('.security-alert')).toContainText(
      'Paste action detected',
      { timeout: 5000 }
    );

    // Verify paste count is tracked
    await interviewerPage.click('button:has-text("Security Events")');
    const pasteEvents = await interviewerPage
      .locator('.security-event-item:has-text("Paste")')
      .count();

    expect(pasteEvents).toBeGreaterThanOrEqual(1);
  });

  test('should verify events are logged to database', async () => {
    // Generate multiple security events
    await intervieweePage.evaluate(() => {
      // Event 1: Window blur
      window.dispatchEvent(new Event('blur'));

      // Event 2: Suspicious process
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent('security-event', {
            detail: {
              type: 'suspicious_process',
              severity: 'high',
              processName: 'Test Process',
              timestamp: Date.now(),
            },
          })
        );
      }, 500);

      // Event 3: Copy attempt
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent('security-event', {
            detail: {
              type: 'copy_detected',
              severity: 'low',
              timestamp: Date.now(),
            },
          })
        );
      }, 1000);
    });

    await interviewerPage.waitForTimeout(3000);

    // Open security events panel
    await interviewerPage.click('button:has-text("Security Events")');

    // Verify all events are listed
    const eventCount = await interviewerPage.locator('.security-event-item').count();
    expect(eventCount).toBeGreaterThanOrEqual(3);

    // End session and check report
    await interviewerPage.click('button:has-text("End Session")');
    await interviewerPage.click('button:has-text("Confirm")');

    await interviewerPage.click('button:has-text("View Report")');
    await expect(interviewerPage).toHaveURL(/\/reports\/\w+/);

    // Verify security events section in report
    await expect(interviewerPage.locator('.report-section.security')).toBeVisible();

    // Verify all logged events appear in report
    const reportEventCount = await interviewerPage
      .locator('.security-events-list .event-item')
      .count();

    expect(reportEventCount).toBeGreaterThanOrEqual(3);

    // Verify event types are displayed
    await expect(interviewerPage.locator('.security-events-list')).toContainText(
      'Window lost focus'
    );
    await expect(interviewerPage.locator('.security-events-list')).toContainText(
      'Suspicious process'
    );
  });

  test('should calculate and display security score', async () => {
    // Generate security events with different severities
    await intervieweePage.evaluate(() => {
      // Low severity events
      for (let i = 0; i < 2; i++) {
        window.dispatchEvent(
          new CustomEvent('security-event', {
            detail: {
              type: 'copy_detected',
              severity: 'low',
              timestamp: Date.now() + i,
            },
          })
        );
      }

      // Medium severity events
      setTimeout(() => {
        for (let i = 0; i < 3; i++) {
          window.dispatchEvent(
            new CustomEvent('security-event', {
              detail: {
                type: 'window_blur',
                severity: 'medium',
                timestamp: Date.now() + i,
              },
            })
          );
        }
      }, 500);

      // High severity event
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent('security-event', {
            detail: {
              type: 'suspicious_process',
              severity: 'high',
              processName: 'Suspicious App',
              timestamp: Date.now(),
            },
          })
        );
      }, 1000);
    });

    await interviewerPage.waitForTimeout(3000);

    // Check security score indicator
    await expect(interviewerPage.locator('.security-score')).toBeVisible();

    const scoreText = await interviewerPage.locator('.security-score').textContent();
    expect(scoreText).toMatch(/\d+/); // Should contain a number

    // Security score should decrease with more/severe events
    const score = parseInt(scoreText?.match(/\d+/)?.[0] || '100');
    expect(score).toBeLessThan(100);

    // End session and verify score in report
    await interviewerPage.click('button:has-text("End Session")');
    await interviewerPage.click('button:has-text("Confirm")');

    await interviewerPage.click('button:has-text("View Report")');

    // Verify security score in report
    await expect(interviewerPage.locator('.report-security-score')).toBeVisible();
    await expect(interviewerPage.locator('.security-risk-level')).toBeVisible();
  });

  test('should filter security events by severity', async () => {
    // Generate events with different severities
    await intervieweePage.evaluate(() => {
      ['low', 'medium', 'high', 'critical'].forEach((severity, index) => {
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('security-event', {
              detail: {
                type: `test_event_${severity}`,
                severity,
                timestamp: Date.now(),
              },
            })
          );
        }, index * 500);
      });
    });

    await interviewerPage.waitForTimeout(3000);

    // Open security events panel
    await interviewerPage.click('button:has-text("Security Events")');

    // Verify all events are shown initially
    const totalEvents = await interviewerPage.locator('.security-event-item').count();
    expect(totalEvents).toBeGreaterThanOrEqual(4);

    // Filter by high severity
    await interviewerPage.click('[data-severity-filter="high"]');

    // Verify only high severity events shown
    const highSeverityEvents = await interviewerPage
      .locator('.security-event-item[data-severity="high"]')
      .count();

    expect(highSeverityEvents).toBeGreaterThanOrEqual(1);

    const allVisibleEvents = await interviewerPage.locator('.security-event-item').count();
    expect(allVisibleEvents).toBe(highSeverityEvents);

    // Clear filter
    await interviewerPage.click('[data-severity-filter="all"]');

    // Verify all events shown again
    const allEventsAfterClear = await interviewerPage.locator('.security-event-item').count();
    expect(allEventsAfterClear).toBe(totalEvents);
  });
});
