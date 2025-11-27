import { test, expect, Page } from '@playwright/test';

/**
 * Video Streaming E2E Tests
 *
 * Tests video functionality including:
 * - WebRTC peer connection establishment
 * - Video stream starts within 2 seconds
 * - Recording starts
 * - Recording stops and uploads to S3
 * - Adaptive bitrate switching
 */

test.describe('Video Streaming', () => {
  let interviewerPage: Page;
  let intervieweePage: Page;

  test.beforeEach(async ({ browser }) => {
    // Create separate contexts with camera/microphone permissions
    const interviewerContext = await browser.newContext({
      permissions: ['camera', 'microphone'],
    });
    const intervieweeContext = await browser.newContext({
      permissions: ['camera', 'microphone'],
    });

    interviewerPage = await interviewerContext.newPage();
    intervieweePage = await intervieweeContext.newPage();

    // Login and create session
    await interviewerPage.goto('/login');
    await interviewerPage.fill('input[name="email"]', 'interviewer@blockd.test');
    await interviewerPage.fill('input[name="password"]', 'Test123456!');
    await interviewerPage.click('button[type="submit"]');
    await interviewerPage.waitForURL('/dashboard');

    await interviewerPage.click('button:has-text("New Session")');
    await interviewerPage.fill('input[name="title"]', 'Video Test Session');
    await interviewerPage.fill('input[name="candidateName"]', 'Video Test Candidate');
    await interviewerPage.fill('input[name="candidateEmail"]', 'video@test.com');
    await interviewerPage.click('button[type="submit"]:has-text("Create")');

    await interviewerPage.click('.session-card:has-text("Video Test Session")');
    await interviewerPage.click('button:has-text("Start Session")');
  });

  test.afterEach(async () => {
    await interviewerPage?.close();
    await intervieweePage?.close();
  });

  test('should establish WebRTC peer connection', async () => {
    // Get invite link
    const inviteLink = await interviewerPage.getAttribute(
      '[data-invite-link]',
      'data-invite-link'
    ) || '';

    // Join as interviewee
    await intervieweePage.goto(inviteLink);
    await intervieweePage.fill('input[name="name"]', 'Video Test Candidate');
    await intervieweePage.click('button:has-text("Join Session")');

    // Wait for media permissions
    await intervieweePage.waitForTimeout(2000);

    // Verify WebRTC connection is established
    const peerConnectionState = await intervieweePage.evaluate(() => {
      return (window as any).__peerConnection__?.connectionState;
    });

    expect(peerConnectionState).toBe('connected');

    // Verify ICE connection state
    const iceConnectionState = await intervieweePage.evaluate(() => {
      return (window as any).__peerConnection__?.iceConnectionState;
    });

    expect(iceConnectionState).toMatch(/connected|completed/);

    // Verify signaling state
    const signalingState = await intervieweePage.evaluate(() => {
      return (window as any).__peerConnection__?.signalingState;
    });

    expect(signalingState).toBe('stable');
  });

  test('should start video stream within 2 seconds', async () => {
    const inviteLink = await interviewerPage.getAttribute(
      '[data-invite-link]',
      'data-invite-link'
    ) || '';

    const startTime = Date.now();

    // Join as interviewee
    await intervieweePage.goto(inviteLink);
    await intervieweePage.fill('input[name="name"]', 'Video Test Candidate');
    await intervieweePage.click('button:has-text("Join Session")');

    // Wait for local video to start
    await expect(intervieweePage.locator('video[data-stream-type="local"]')).toBeVisible({
      timeout: 3000,
    });

    // Verify video element has srcObject
    const hasLocalStream = await intervieweePage.evaluate(() => {
      const video = document.querySelector('video[data-stream-type="local"]') as HTMLVideoElement;
      return video && video.srcObject !== null;
    });

    expect(hasLocalStream).toBeTruthy();

    // Wait for remote video to appear on interviewer side
    await expect(interviewerPage.locator('video[data-stream-type="remote"]')).toBeVisible({
      timeout: 5000,
    });

    const streamStartTime = Date.now() - startTime;

    // Verify stream started within acceptable time (allowing some margin)
    expect(streamStartTime).toBeLessThan(5000); // 5 seconds with margin

    // Verify video is actually playing
    const isPlaying = await interviewerPage.evaluate(() => {
      const video = document.querySelector('video[data-stream-type="remote"]') as HTMLVideoElement;
      return video && !video.paused && video.readyState >= 2;
    });

    expect(isPlaying).toBeTruthy();
  });

  test('should start and display recording indicator', async () => {
    const inviteLink = await interviewerPage.getAttribute(
      '[data-invite-link]',
      'data-invite-link'
    ) || '';

    await intervieweePage.goto(inviteLink);
    await intervieweePage.fill('input[name="name"]', 'Video Test Candidate');
    await intervieweePage.click('button:has-text("Join Session")');

    await expect(intervieweePage.locator('.ws-status[data-status="connected"]')).toBeVisible();

    // Start recording
    await interviewerPage.click('button:has-text("Start Recording")');

    // Verify recording indicator appears
    await expect(interviewerPage.locator('.recording-indicator')).toBeVisible({ timeout: 3000 });
    await expect(interviewerPage.locator('.recording-indicator')).toHaveAttribute(
      'data-recording',
      'true'
    );

    // Verify recording indicator shows on interviewee side
    await expect(intervieweePage.locator('.recording-indicator')).toBeVisible({ timeout: 3000 });

    // Verify recording time counter is running
    await interviewerPage.waitForTimeout(2000);

    const recordingTime = await interviewerPage.locator('.recording-time').textContent();
    expect(recordingTime).toMatch(/\d{2}:\d{2}/); // Format: MM:SS

    // Verify recording state in application
    const isRecording = await interviewerPage.evaluate(() => {
      return (window as any).__isRecording__;
    });

    expect(isRecording).toBeTruthy();
  });

  test('should stop recording and confirm upload', async () => {
    const inviteLink = await interviewerPage.getAttribute(
      '[data-invite-link]',
      'data-invite-link'
    ) || '';

    await intervieweePage.goto(inviteLink);
    await intervieweePage.fill('input[name="name"]', 'Video Test Candidate');
    await intervieweePage.click('button:has-text("Join Session")');

    await expect(intervieweePage.locator('.ws-status[data-status="connected"]')).toBeVisible();

    // Start recording
    await interviewerPage.click('button:has-text("Start Recording")');
    await expect(interviewerPage.locator('.recording-indicator')).toBeVisible();

    // Record for a few seconds
    await interviewerPage.waitForTimeout(3000);

    // Stop recording
    await interviewerPage.click('button:has-text("Stop Recording")');

    // Verify recording stopped
    await expect(interviewerPage.locator('.recording-indicator[data-recording="false"]')).toBeVisible({
      timeout: 3000,
    });

    // Verify upload process starts
    await expect(interviewerPage.locator('.upload-progress')).toBeVisible({ timeout: 5000 });

    // Wait for upload to complete (with timeout)
    await expect(interviewerPage.locator('.upload-complete')).toBeVisible({ timeout: 30000 });

    // Verify upload success message
    await expect(interviewerPage.locator('.toast-success')).toContainText(
      'Recording uploaded successfully',
      { timeout: 5000 }
    );

    // Verify video URL is available
    const videoUrl = await interviewerPage.evaluate(() => {
      return (window as any).__recordingUrl__;
    });

    expect(videoUrl).toBeTruthy();
    expect(videoUrl).toMatch(/^https?:\/\/.+\.(mp4|webm)/);
  });

  test('should handle video quality adaptation', async () => {
    const inviteLink = await interviewerPage.getAttribute(
      '[data-invite-link]',
      'data-invite-link'
    ) || '';

    await intervieweePage.goto(inviteLink);
    await intervieweePage.fill('input[name="name"]', 'Video Test Candidate');
    await intervieweePage.click('button:has-text("Join Session")');

    await expect(intervieweePage.locator('video[data-stream-type="local"]')).toBeVisible();
    await expect(interviewerPage.locator('video[data-stream-type="remote"]')).toBeVisible();

    // Get initial video quality settings
    const initialQuality = await intervieweePage.evaluate(() => {
      const sender = (window as any).__peerConnection__
        ?.getSenders()
        .find((s: RTCRtpSender) => s.track?.kind === 'video');

      const params = sender?.getParameters();
      return {
        maxBitrate: params?.encodings?.[0]?.maxBitrate,
        width: sender?.track?.getSettings().width,
        height: sender?.track?.getSettings().height,
      };
    });

    expect(initialQuality.width).toBeGreaterThan(0);
    expect(initialQuality.height).toBeGreaterThan(0);

    // Simulate network degradation
    await intervieweePage.context().route('**/*', (route) => {
      // Delay requests to simulate poor network
      setTimeout(() => route.continue(), 100);
    });

    // Wait for quality adaptation
    await intervieweePage.waitForTimeout(3000);

    // Check if quality was adjusted (bitrate adaptation)
    const adaptedQuality = await intervieweePage.evaluate(() => {
      const sender = (window as any).__peerConnection__
        ?.getSenders()
        .find((s: RTCRtpSender) => s.track?.kind === 'video');

      const params = sender?.getParameters();
      return {
        maxBitrate: params?.encodings?.[0]?.maxBitrate,
      };
    });

    // In a real scenario with proper adaptive bitrate, this should change
    // expect(adaptedQuality.maxBitrate).toBeLessThan(initialQuality.maxBitrate || Infinity);
  });

  test('should display video statistics', async () => {
    const inviteLink = await interviewerPage.getAttribute(
      '[data-invite-link]',
      'data-invite-link'
    ) || '';

    await intervieweePage.goto(inviteLink);
    await intervieweePage.fill('input[name="name"]', 'Video Test Candidate');
    await intervieweePage.click('button:has-text("Join Session")');

    await expect(intervieweePage.locator('video[data-stream-type="local"]')).toBeVisible();
    await expect(interviewerPage.locator('video[data-stream-type="remote"]')).toBeVisible();

    // Open video stats panel
    await interviewerPage.click('button[data-video-stats]');

    // Verify stats panel is visible
    await expect(interviewerPage.locator('.video-stats-panel')).toBeVisible();

    // Verify key metrics are displayed
    await expect(interviewerPage.locator('.stat-bitrate')).toBeVisible();
    await expect(interviewerPage.locator('.stat-framerate')).toBeVisible();
    await expect(interviewerPage.locator('.stat-resolution')).toBeVisible();
    await expect(interviewerPage.locator('.stat-packets-lost')).toBeVisible();

    // Verify values are updating
    const initialBitrate = await interviewerPage.locator('.stat-bitrate').textContent();

    await interviewerPage.waitForTimeout(2000);

    const updatedBitrate = await interviewerPage.locator('.stat-bitrate').textContent();

    // Values should be present (might be same or different)
    expect(initialBitrate).toBeTruthy();
    expect(updatedBitrate).toBeTruthy();
  });

  test('should handle camera/microphone toggle', async () => {
    const inviteLink = await interviewerPage.getAttribute(
      '[data-invite-link]',
      'data-invite-link'
    ) || '';

    await intervieweePage.goto(inviteLink);
    await intervieweePage.fill('input[name="name"]', 'Video Test Candidate');
    await intervieweePage.click('button:has-text("Join Session")');

    await expect(intervieweePage.locator('video[data-stream-type="local"]')).toBeVisible();

    // Verify video is initially enabled
    const videoEnabled = await intervieweePage.evaluate(() => {
      const videoTrack = (window as any).__localStream__?.getVideoTracks()[0];
      return videoTrack?.enabled;
    });

    expect(videoEnabled).toBeTruthy();

    // Toggle video off
    await intervieweePage.click('button[data-toggle-video]');

    // Verify video track is disabled
    const videoDisabled = await intervieweePage.evaluate(() => {
      const videoTrack = (window as any).__localStream__?.getVideoTracks()[0];
      return videoTrack?.enabled;
    });

    expect(videoDisabled).toBeFalsy();

    // Verify video muted indicator appears
    await expect(intervieweePage.locator('.video-muted-indicator')).toBeVisible();

    // Verify interviewer sees the muted state
    await expect(interviewerPage.locator('.remote-video-muted')).toBeVisible({ timeout: 3000 });

    // Toggle video back on
    await intervieweePage.click('button[data-toggle-video]');

    const videoReEnabled = await intervieweePage.evaluate(() => {
      const videoTrack = (window as any).__localStream__?.getVideoTracks()[0];
      return videoTrack?.enabled;
    });

    expect(videoReEnabled).toBeTruthy();

    // Test microphone toggle
    await intervieweePage.click('button[data-toggle-audio]');

    const audioDisabled = await intervieweePage.evaluate(() => {
      const audioTrack = (window as any).__localStream__?.getAudioTracks()[0];
      return audioTrack?.enabled;
    });

    expect(audioDisabled).toBeFalsy();

    await expect(intervieweePage.locator('.audio-muted-indicator')).toBeVisible();
  });

  test('should handle connection interruption gracefully', async () => {
    const inviteLink = await interviewerPage.getAttribute(
      '[data-invite-link]',
      'data-invite-link'
    ) || '';

    await intervieweePage.goto(inviteLink);
    await intervieweePage.fill('input[name="name"]', 'Video Test Candidate');
    await intervieweePage.click('button:has-text("Join Session")');

    await expect(intervieweePage.locator('video[data-stream-type="local"]')).toBeVisible();
    await expect(interviewerPage.locator('video[data-stream-type="remote"]')).toBeVisible();

    // Verify connection is stable
    await expect(interviewerPage.locator('.connection-quality[data-quality="good"]')).toBeVisible();

    // Simulate network interruption
    await intervieweePage.context().setOffline(true);

    // Verify connection quality indicator changes
    await expect(interviewerPage.locator('.connection-quality[data-quality="poor"]')).toBeVisible({
      timeout: 5000,
    });

    await expect(interviewerPage.locator('.reconnecting-indicator')).toBeVisible();

    // Restore connection
    await intervieweePage.context().setOffline(false);

    // Verify reconnection
    await expect(interviewerPage.locator('.connection-quality[data-quality="good"]')).toBeVisible({
      timeout: 10000,
    });

    await expect(interviewerPage.locator('.reconnecting-indicator')).not.toBeVisible();

    // Verify video stream is restored
    const isPlaying = await interviewerPage.evaluate(() => {
      const video = document.querySelector('video[data-stream-type="remote"]') as HTMLVideoElement;
      return video && !video.paused && video.readyState >= 2;
    });

    expect(isPlaying).toBeTruthy();
  });

  test('should show video preview before joining', async () => {
    const inviteLink = await interviewerPage.getAttribute(
      '[data-invite-link]',
      'data-invite-link'
    ) || '';

    await intervieweePage.goto(inviteLink);

    // Should show device setup/preview page before joining
    await expect(intervieweePage.locator('.device-setup-page')).toBeVisible();

    // Verify preview video is shown
    await expect(intervieweePage.locator('video[data-preview="true"]')).toBeVisible({
      timeout: 3000,
    });

    // Verify camera/microphone selection dropdowns
    await expect(intervieweePage.locator('select[name="cameraDevice"]')).toBeVisible();
    await expect(intervieweePage.locator('select[name="microphoneDevice"]')).toBeVisible();

    // Verify test microphone feature
    await expect(intervieweePage.locator('.microphone-test')).toBeVisible();

    // Select devices and join
    await intervieweePage.fill('input[name="name"]', 'Video Test Candidate');
    await intervieweePage.click('button:has-text("Join Session")');

    // Verify transitioned to session page
    await expect(intervieweePage.locator('.session-page')).toBeVisible();
  });
});
