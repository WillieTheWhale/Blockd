/**
 * Test script for RabbitMQ Publisher (TypeScript)
 * Tests connection, publishing, and load testing
 */

import {
  RabbitMQPublisher,
  publishVideoTask,
  publishAITask,
  publishSecurityEvent,
  publishGazeTask,
} from './publisher';

interface TestResult {
  name: string;
  success: boolean;
}

/**
 * Test RabbitMQ connection
 */
async function testConnection(): Promise<boolean> {
  console.log('=== Testing RabbitMQ Connection ===');

  const publisher = new RabbitMQPublisher();
  const success = await publisher.connect();

  if (success) {
    console.log('✓ Connection successful');
    await publisher.disconnect();
    return true;
  } else {
    console.error('✗ Connection failed');
    return false;
  }
}

/**
 * Test basic message publishing
 */
async function testBasicPublishing(): Promise<boolean> {
  console.log('\n=== Testing Basic Publishing ===');

  const publisher = new RabbitMQPublisher();
  await publisher.connect();

  try {
    const results: [string, boolean][] = [];

    // Test video task
    console.log('Publishing video encoding task...');
    let success = await publishVideoTask(
      'encode',
      'test_video_001',
      { quality: '1080p', codec: 'h264' },
      publisher
    );
    results.push(['video_encode', success]);

    // Test AI task
    console.log('Publishing AI analysis task...');
    success = await publishAITask(
      'analyze',
      'test_exam_001',
      { answer_id: 'ans_001', text: 'Sample answer for testing' },
      publisher
    );
    results.push(['ai_analyze', success]);

    // Test security event
    console.log('Publishing security event...');
    success = await publishSecurityEvent(
      'test_event',
      { user_id: 'user_001', severity: 'medium', description: 'Test event' },
      publisher
    );
    results.push(['security_event', success]);

    // Test gaze task
    console.log('Publishing gaze processing task...');
    success = await publishGazeTask(
      'process',
      'test_session_001',
      { gaze_data: [{ x: 100, y: 200, timestamp: Date.now() }] },
      publisher
    );
    results.push(['gaze_process', success]);

    // Print results
    console.log('\nPublishing Results:');
    let successCount = 0;
    for (const [taskType, success] of results) {
      const status = success ? '✓' : '✗';
      console.log(`  ${status} ${taskType}`);
      if (success) successCount++;
    }

    console.log(`\nTotal: ${successCount}/${results.length} successful`);
    return successCount === results.length;
  } finally {
    await publisher.disconnect();
  }
}

/**
 * Test batch publishing
 */
async function testBatchPublishing(): Promise<boolean> {
  console.log('\n=== Testing Batch Publishing ===');

  const publisher = new RabbitMQPublisher();
  await publisher.connect();

  try {
    const batchSize = 100;
    const messages: Array<{ routingKey: string; message: any }> = [];

    for (let i = 0; i < batchSize; i++) {
      messages.push({
        routingKey: `video.encode.batch_test_${i}`,
        message: {
          video_id: `batch_test_${i}`,
          quality: '720p',
          codec: 'h264',
        },
      });
    }

    const startTime = Date.now();
    const successCount = await publisher.publishBatch('video_processing', messages);
    const elapsed = (Date.now() - startTime) / 1000;

    console.log(`Published ${successCount}/${batchSize} messages`);
    console.log(`Time: ${elapsed.toFixed(2)}s`);
    console.log(`Rate: ${(successCount / elapsed).toFixed(2)} msg/s`);

    return successCount === batchSize;
  } finally {
    await publisher.disconnect();
  }
}

/**
 * Test retry logic
 */
async function testRetryLogic(): Promise<boolean> {
  console.log('\n=== Testing Retry Logic ===');

  const publisher = new RabbitMQPublisher({
    hosts: ['invalid-host-1', 'invalid-host-2', 'localhost'],
  });

  const startTime = Date.now();
  const success = await publisher.connect();
  const elapsed = (Date.now() - startTime) / 1000;

  if (success) {
    console.log(`✓ Connected after retries (${elapsed.toFixed(2)}s)`);
    await publisher.disconnect();
    return true;
  } else {
    console.error('✗ Failed to connect even with valid fallback host');
    return false;
  }
}

/**
 * Load test
 */
async function loadTest(
  messagesPerSecond: number = 1000,
  durationSeconds: number = 10
): Promise<boolean> {
  console.log(
    `\n=== Load Test: ${messagesPerSecond} msg/s for ${durationSeconds}s ===`
  );

  const totalMessages = messagesPerSecond * durationSeconds;
  const batchSize = 100;
  const delayBetweenBatches = (batchSize / messagesPerSecond) * 1000;

  console.log(`Total messages: ${totalMessages}`);
  console.log(`Batch size: ${batchSize}`);
  console.log(`Delay between batches: ${delayBetweenBatches.toFixed(3)}ms`);

  const publisher = new RabbitMQPublisher();
  await publisher.connect();

  try {
    let totalSent = 0;
    let totalFailed = 0;
    const startTime = Date.now();

    const numBatches = Math.floor(totalMessages / batchSize);

    for (let batchNum = 0; batchNum < numBatches; batchNum++) {
      const batchStart = Date.now();

      // Prepare batch
      const messages: Array<{ routingKey: string; message: any }> = [];
      for (let i = 0; i < batchSize; i++) {
        const msgId = batchNum * batchSize + i;
        messages.push({
          routingKey: `ai.analyze.load_test_${msgId}`,
          message: {
            exam_id: `load_test_${msgId}`,
            answer_id: `ans_${msgId}`,
            text: `Sample answer ${msgId}`,
          },
        });
      }

      // Publish batch
      const successCount = await publisher.publishBatch('ai_detection', messages);
      totalSent += successCount;
      totalFailed += batchSize - successCount;

      // Progress update
      if ((batchNum + 1) % 10 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = elapsed > 0 ? totalSent / elapsed : 0;
        console.log(`Progress: ${totalSent}/${totalMessages} (${rate.toFixed(0)} msg/s)`);
      }

      // Rate limiting
      const batchElapsed = Date.now() - batchStart;
      if (batchElapsed < delayBetweenBatches) {
        await sleep(delayBetweenBatches - batchElapsed);
      }
    }

    // Final stats
    const totalElapsed = (Date.now() - startTime) / 1000;
    const actualRate = totalSent / totalElapsed;

    console.log('\n=== Load Test Results ===');
    console.log(`Messages sent: ${totalSent}`);
    console.log(`Messages failed: ${totalFailed}`);
    console.log(`Total time: ${totalElapsed.toFixed(2)}s`);
    console.log(`Actual rate: ${actualRate.toFixed(2)} msg/s`);
    console.log(`Target rate: ${messagesPerSecond} msg/s`);
    console.log(`Success rate: ${((totalSent / totalMessages) * 100).toFixed(1)}%`);

    return totalSent >= totalMessages * 0.95;
  } finally {
    await publisher.disconnect();
  }
}

/**
 * Stress test with concurrent publishers
 */
async function stressTestConcurrentPublishers(
  numPublishers: number = 10,
  messagesPerPublisher: number = 100
): Promise<boolean> {
  console.log(`\n=== Stress Test: ${numPublishers} concurrent publishers ===`);

  async function publisherTask(publisherId: number): Promise<[number, number]> {
    const publisher = new RabbitMQPublisher();
    await publisher.connect();

    try {
      let successCount = 0;
      for (let i = 0; i < messagesPerPublisher; i++) {
        const message = {
          publisher_id: publisherId,
          message_id: i,
          data: `Message ${i} from publisher ${publisherId}`,
        };
        const routingKey = `video.encode.stress_test_${publisherId}_${i}`;

        if (await publisher.publish('video_processing', routingKey, message)) {
          successCount++;
        }
      }
      return [publisherId, successCount];
    } finally {
      await publisher.disconnect();
    }
  }

  const startTime = Date.now();

  const promises = Array.from({ length: numPublishers }, (_, i) => publisherTask(i));
  const results = await Promise.all(promises);

  const totalSuccess = results.reduce((sum, [_, count]) => sum + count, 0);
  results.forEach(([publisherId, successCount]) => {
    console.log(`Publisher ${publisherId}: ${successCount}/${messagesPerPublisher} messages`);
  });

  const elapsed = (Date.now() - startTime) / 1000;
  const totalMessages = numPublishers * messagesPerPublisher;
  const rate = totalSuccess / elapsed;

  console.log('\n=== Stress Test Results ===');
  console.log(`Total messages: ${totalSuccess}/${totalMessages}`);
  console.log(`Total time: ${elapsed.toFixed(2)}s`);
  console.log(`Throughput: ${rate.toFixed(2)} msg/s`);
  console.log(`Success rate: ${((totalSuccess / totalMessages) * 100).toFixed(1)}%`);

  return totalSuccess >= totalMessages * 0.95;
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run all tests
 */
async function runAllTests(): Promise<boolean> {
  console.log('='.repeat(60));
  console.log('RabbitMQ Publisher Test Suite (TypeScript)');
  console.log('='.repeat(60));

  const tests: Array<[string, () => Promise<boolean>]> = [
    ['Connection Test', testConnection],
    ['Basic Publishing Test', testBasicPublishing],
    ['Batch Publishing Test', testBatchPublishing],
    ['Retry Logic Test', testRetryLogic],
    ['Load Test (1000 msg/s)', () => loadTest(1000, 10)],
    [
      'Stress Test (10 concurrent publishers)',
      () => stressTestConcurrentPublishers(10, 100),
    ],
  ];

  const results: TestResult[] = [];

  for (const [testName, testFunc] of tests) {
    try {
      console.log(`\n${'='.repeat(60)}`);
      const success = await testFunc();
      results.push({ name: testName, success });

      if (success) {
        console.log(`✓ ${testName} PASSED`);
      } else {
        console.error(`✗ ${testName} FAILED`);
      }
    } catch (error) {
      console.error(`✗ ${testName} FAILED with exception:`, error);
      results.push({ name: testName, success: false });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter((r) => r.success).length;
  const total = results.length;

  for (const result of results) {
    const status = result.success ? '✓ PASS' : '✗ FAIL';
    console.log(`${status}: ${result.name}`);
  }

  console.log(`\nTotal: ${passed}/${total} tests passed`);

  return passed === total;
}

// Run tests
runAllTests()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
