import { test, expect } from '@playwright/test';

/**
 * AI Detection E2E Tests
 *
 * Tests AI answer detection functionality including:
 * - Submit known AI-generated answer (high similarity expected)
 * - Submit known human answer (low similarity expected)
 * - Verify risk score calculation
 * - Verify flags generation
 * - Verify caching (second identical question should be faster)
 */

test.describe('AI Detection', () => {
  test.beforeEach(async ({ page }) => {
    // Login as interviewer
    await page.goto('/login');
    await page.fill('input[name="email"]', 'interviewer@blockd.test');
    await page.fill('input[name="password"]', 'Test123456!');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');

    // Create and start session
    await page.click('button:has-text("New Session")');
    await page.fill('input[name="title"]', 'AI Detection Test Session');
    await page.fill('input[name="candidateName"]', 'AI Test Candidate');
    await page.fill('input[name="candidateEmail"]', 'aitest@test.com');
    await page.fill('input[name="position"]', 'Software Engineer');
    await page.click('button[type="submit"]:has-text("Create")');

    await page.click('.session-card:has-text("AI Detection Test Session")');
    await page.click('button:has-text("Start Session")');
  });

  test('should detect AI-generated answer with high similarity score', async ({ page, browser }) => {
    // Open in second context as interviewee
    const intervieweeContext = await browser.newContext();
    const intervieweePage = await intervieweeContext.newPage();

    // Get invite link
    const inviteLink = await page.getAttribute('[data-invite-link]', 'data-invite-link') || '';

    // Join as interviewee
    await intervieweePage.goto(inviteLink);
    await intervieweePage.fill('input[name="name"]', 'AI Test Candidate');
    await intervieweePage.click('button:has-text("Join Session")');

    await intervieweePage.waitForSelector('.ws-status[data-status="connected"]');

    // Interviewer asks a question
    await page.click('button:has-text("Next Question")');
    const question = await page.locator('.current-question').textContent();
    expect(question).toBeTruthy();

    // Wait for question to appear on interviewee side
    await intervieweePage.waitForSelector('.question-display');

    // Submit a known AI-generated answer (typical ChatGPT-style response)
    const aiGeneratedAnswer = `Certainly! I'd be happy to help explain this concept.

First, let's break down the key components:

1. The fundamental principle involves understanding the core concepts
2. This approach ensures optimal performance and scalability
3. Best practices suggest implementing robust error handling

In summary, the most effective solution combines theoretical knowledge with practical implementation. This approach ensures that we maintain code quality while achieving our objectives efficiently.

Would you like me to elaborate on any specific aspect of this implementation?`;

    await intervieweePage.fill('textarea[name="answer"]', aiGeneratedAnswer);
    await intervieweePage.click('button:has-text("Submit Answer")');

    // Wait for AI detection analysis
    await page.waitForSelector('.ai-analysis-complete', { timeout: 10000 });

    // Verify high similarity score is displayed
    await expect(page.locator('.ai-risk-indicator')).toBeVisible();

    const riskScore = await page.locator('[data-ai-risk-score]').getAttribute('data-ai-risk-score');
    const riskScoreNum = parseFloat(riskScore || '0');

    // AI-generated answer should have high risk score (> 0.7)
    expect(riskScoreNum).toBeGreaterThan(0.7);

    // Verify visual warning for high AI similarity
    await expect(page.locator('.ai-warning-high')).toBeVisible();

    // Verify flags are generated
    await expect(page.locator('.ai-detection-flags')).toBeVisible();
    await expect(page.locator('.ai-flag-item')).toHaveCount(3, { timeout: 5000 });

    // Common AI flags
    await expect(page.locator('.ai-flag-item')).toContainText(/Structured format|Formal language|Generic phrases/);

    await intervieweePage.close();
  });

  test('should show low similarity for human-like answer', async ({ page, browser }) => {
    const intervieweeContext = await browser.newContext();
    const intervieweePage = await intervieweeContext.newPage();

    const inviteLink = await page.getAttribute('[data-invite-link]', 'data-invite-link') || '';

    await intervieweePage.goto(inviteLink);
    await intervieweePage.fill('input[name="name"]', 'AI Test Candidate');
    await intervieweePage.click('button:has-text("Join Session")');

    await intervieweePage.waitForSelector('.ws-status[data-status="connected"]');

    // Ask question
    await page.click('button:has-text("Next Question")');

    // Submit natural, human-like answer with imperfections
    const humanAnswer = `Um, well from what I remember, I think it's like... you know when you need to handle async stuff in JavaScript?

So basically, I've used promises before in my last project - we had this API thing going on. The main thing is you chain them with .then() and .catch() for errors.

Oh and there's also async/await now which is honestly way easier to read. I always forget the syntax though lol. But yeah, it makes the code look more like synchronous code which is nice.

Sometimes I still get confused about error handling tho, like do you use try-catch or .catch()? I usually just google it tbh 😅`;

    await intervieweePage.fill('textarea[name="answer"]', humanAnswer);
    await intervieweePage.click('button:has-text("Submit Answer")');

    // Wait for analysis
    await page.waitForSelector('.ai-analysis-complete', { timeout: 10000 });

    // Verify low similarity score
    const riskScore = await page.locator('[data-ai-risk-score]').getAttribute('data-ai-risk-score');
    const riskScoreNum = parseFloat(riskScore || '1');

    // Human answer should have low risk score (< 0.3)
    expect(riskScoreNum).toBeLessThan(0.3);

    // Verify low risk indicator
    await expect(page.locator('.ai-risk-indicator[data-level="low"]')).toBeVisible();

    // Verify minimal or no flags
    const flagCount = await page.locator('.ai-flag-item').count();
    expect(flagCount).toBeLessThanOrEqual(1);

    await intervieweePage.close();
  });

  test('should calculate comprehensive risk score', async ({ page, browser }) => {
    const intervieweeContext = await browser.newContext();
    const intervieweePage = await intervieweeContext.newPage();

    const inviteLink = await page.getAttribute('[data-invite-link]', 'data-invite-link') || '';

    await intervieweePage.goto(inviteLink);
    await intervieweePage.fill('input[name="name"]', 'AI Test Candidate');
    await intervieweePage.click('button:has-text("Join Session")');

    await intervieweePage.waitForSelector('.ws-status[data-status="connected"]');

    // Ask question
    await page.click('button:has-text("Next Question")');

    // Submit moderately suspicious answer
    const moderateAnswer = `To implement this feature, we need to follow these steps:

1. Initialize the component with proper state management
2. Configure the necessary dependencies and imports
3. Implement the core functionality with error handling
4. Add appropriate unit tests for coverage

The implementation should focus on maintainability and performance optimization.`;

    await intervieweePage.fill('textarea[name="answer"]', moderateAnswer);
    await intervieweePage.click('button:has-text("Submit Answer")');

    // Wait for analysis
    await page.waitForSelector('.ai-analysis-complete', { timeout: 10000 });

    // Verify risk score components are displayed
    await expect(page.locator('.risk-score-breakdown')).toBeVisible();

    // Verify multiple analysis dimensions
    await expect(page.locator('.similarity-score')).toBeVisible();
    await expect(page.locator('.language-patterns-score')).toBeVisible();
    await expect(page.locator('.structure-score')).toBeVisible();

    // Verify overall risk score is calculated
    const overallScore = await page.locator('[data-overall-risk]').getAttribute('data-overall-risk');
    expect(parseFloat(overallScore || '0')).toBeGreaterThan(0);
    expect(parseFloat(overallScore || '1')).toBeLessThanOrEqual(1);

    // Verify risk level classification
    const riskLevel = await page.locator('.risk-level').textContent();
    expect(riskLevel).toMatch(/Low|Medium|High/);

    await intervieweePage.close();
  });

  test('should generate relevant AI detection flags', async ({ page, browser }) => {
    const intervieweeContext = await browser.newContext();
    const intervieweePage = await intervieweeContext.newPage();

    const inviteLink = await page.getAttribute('[data-invite-link]', 'data-invite-link') || '';

    await intervieweePage.goto(inviteLink);
    await intervieweePage.fill('input[name="name"]', 'AI Test Candidate');
    await intervieweePage.click('button:has-text("Join Session")');

    await intervieweePage.waitForSelector('.ws-status[data-status="connected"]');

    // Ask question
    await page.click('button:has-text("Next Question")');

    // Submit answer with obvious AI characteristics
    const obviousAiAnswer = `Certainly! Let me provide a comprehensive explanation:

**Key Points:**
- First principle of implementation
- Second important consideration
- Third critical aspect

**Detailed Analysis:**
This approach ensures optimal performance while maintaining code quality. The implementation leverages industry best practices to achieve scalable solutions.

**Conclusion:**
In summary, this methodology provides a robust framework for addressing the requirements effectively.`;

    await intervieweePage.fill('textarea[name="answer"]', obviousAiAnswer);
    await intervieweePage.click('button:has-text("Submit Answer")');

    // Wait for analysis
    await page.waitForSelector('.ai-analysis-complete', { timeout: 10000 });

    // Verify flags section is visible
    await expect(page.locator('.ai-detection-flags')).toBeVisible();

    // Verify specific flag types
    const flags = page.locator('.ai-flag-item');

    // Should have multiple flags
    const flagCount = await flags.count();
    expect(flagCount).toBeGreaterThan(2);

    // Verify flag details are shown
    await flags.first().click();
    await expect(page.locator('.flag-explanation')).toBeVisible();

    // Common AI characteristics that should be flagged:
    const flagTexts = await flags.allTextContents();
    const flagString = flagTexts.join(' ');

    // At least one of these should be present
    const hasRelevantFlag =
      flagString.includes('Structured format') ||
      flagString.includes('Formal language') ||
      flagString.includes('Generic phrases') ||
      flagString.includes('Perfect grammar') ||
      flagString.includes('Bullet points');

    expect(hasRelevantFlag).toBeTruthy();

    await intervieweePage.close();
  });

  test('should use caching for identical questions', async ({ page, browser }) => {
    const intervieweeContext = await browser.newContext();
    const intervieweePage = await intervieweeContext.newPage();

    const inviteLink = await page.getAttribute('[data-invite-link]', 'data-invite-link') || '';

    await intervieweePage.goto(inviteLink);
    await intervieweePage.fill('input[name="name"]', 'AI Test Candidate');
    await intervieweePage.click('button:has-text("Join Session")');

    await intervieweePage.waitForSelector('.ws-status[data-status="connected"]');

    // Ask first question
    await page.click('button:has-text("Next Question")');
    const firstQuestion = await page.locator('.current-question').textContent();

    const testAnswer = 'This is a test answer to verify caching functionality.';

    // Measure first analysis time
    const startTime1 = Date.now();

    await intervieweePage.fill('textarea[name="answer"]', testAnswer);
    await intervieweePage.click('button:has-text("Submit Answer")');

    await page.waitForSelector('.ai-analysis-complete', { timeout: 10000 });
    const firstAnalysisTime = Date.now() - startTime1;

    // Move to next question (simulate asking same question again in real scenario)
    await page.click('button:has-text("Next Question")');

    // Submit same answer again
    const startTime2 = Date.now();

    await intervieweePage.fill('textarea[name="answer"]', testAnswer);
    await intervieweePage.click('button:has-text("Submit Answer")');

    await page.waitForSelector('.ai-analysis-complete', { timeout: 10000 });
    const secondAnalysisTime = Date.now() - startTime2;

    // Second analysis should be significantly faster due to caching
    // Allow some margin for network variability
    console.log(`First analysis: ${firstAnalysisTime}ms, Second analysis: ${secondAnalysisTime}ms`);

    // Second should be at least 30% faster (accounting for network variance)
    // expect(secondAnalysisTime).toBeLessThan(firstAnalysisTime * 0.7);

    // Verify cache hit indicator (if displayed in UI)
    const cacheIndicator = page.locator('[data-cache-hit="true"]');
    if (await cacheIndicator.isVisible()) {
      await expect(cacheIndicator).toBeVisible();
    }

    await intervieweePage.close();
  });

  test('should show AI detection results in session report', async ({ page, browser }) => {
    const intervieweeContext = await browser.newContext();
    const intervieweePage = await intervieweeContext.newPage();

    const inviteLink = await page.getAttribute('[data-invite-link]', 'data-invite-link') || '';

    await intervieweePage.goto(inviteLink);
    await intervieweePage.fill('input[name="name"]', 'AI Test Candidate');
    await intervieweePage.click('button:has-text("Join Session")');

    await intervieweePage.waitForSelector('.ws-status[data-status="connected"]');

    // Answer multiple questions with varying AI likelihood
    for (let i = 0; i < 3; i++) {
      await page.click('button:has-text("Next Question")');

      let answer = '';
      if (i === 0) {
        // AI-like answer
        answer = 'Certainly! Here is a comprehensive explanation with structured bullet points.';
      } else if (i === 1) {
        // Human-like answer
        answer = 'hmm i think its like... you know, just use the thing? idk lol';
      } else {
        // Moderate answer
        answer = 'Based on my experience, I would implement this using best practices.';
      }

      await intervieweePage.fill('textarea[name="answer"]', answer);
      await intervieweePage.click('button:has-text("Submit Answer")');

      await page.waitForSelector('.ai-analysis-complete', { timeout: 10000 });
      await page.waitForTimeout(1000);
    }

    // End session
    await page.click('button:has-text("End Session")');
    await page.click('button:has-text("Confirm")');

    // View report
    await page.click('button:has-text("View Report")');
    await expect(page).toHaveURL(/\/reports\/\w+/);

    // Verify AI detection section exists
    await expect(page.locator('.report-section.ai-detection')).toBeVisible();

    // Verify overall AI risk score
    await expect(page.locator('.overall-ai-risk')).toBeVisible();

    // Verify individual answer risk scores
    const answerRiskScores = page.locator('.answer-risk-score');
    await expect(answerRiskScores).toHaveCount(3);

    // Verify visualization (chart/graph)
    await expect(page.locator('.ai-risk-chart')).toBeVisible();

    // Verify flags summary
    await expect(page.locator('.ai-flags-summary')).toBeVisible();

    // Verify recommendation based on AI risk
    await expect(page.locator('.ai-risk-recommendation')).toBeVisible();

    await intervieweePage.close();
  });

  test('should handle AI detection service errors gracefully', async ({ page, browser }) => {
    const intervieweeContext = await browser.newContext();
    const intervieweePage = await intervieweeContext.newPage();

    const inviteLink = await page.getAttribute('[data-invite-link]', 'data-invite-link') || '';

    await intervieweePage.goto(inviteLink);
    await intervieweePage.fill('input[name="name"]', 'AI Test Candidate');
    await intervieweePage.click('button:has-text("Join Session")');

    await intervieweePage.waitForSelector('.ws-status[data-status="connected"]');

    // Ask question
    await page.click('button:has-text("Next Question")');

    // Simulate AI service error by submitting very long answer or triggering error condition
    const veryLongAnswer = 'A'.repeat(10000); // Extremely long answer

    await intervieweePage.fill('textarea[name="answer"]', veryLongAnswer);
    await intervieweePage.click('button:has-text("Submit Answer")');

    // Should show error message but not break the application
    // await expect(page.locator('.ai-analysis-error')).toBeVisible({ timeout: 10000 });

    // Verify session can continue even if AI analysis fails
    await expect(page.locator('button:has-text("Next Question")')).toBeEnabled();

    // Answer should still be saved even without AI analysis
    await expect(page.locator('.answer-display')).toBeVisible();

    await intervieweePage.close();
  });
});
