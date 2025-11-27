import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

/**
 * Stress Test for Blockd Platform
 *
 * Scenario: Ramp from 0 to 1000 VUs over 10 minutes
 * Objective: Find breaking point and system limits
 * Monitor: CPU, Memory, Database connections, Response times
 */

// Custom metrics
const apiErrorRate = new Rate('api_errors');
const apiResponseTime = new Trend('api_response_time');
const activeConnections = new Gauge('active_connections');
const dbConnectionErrors = new Counter('db_connection_errors');
const systemErrors = new Counter('system_errors');
const successfulRequests = new Counter('successful_requests');
const failedRequests = new Counter('failed_requests');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 100 },    // Baseline
    { duration: '2m', target: 300 },    // Moderate load
    { duration: '2m', target: 500 },    // Heavy load
    { duration: '2m', target: 700 },    // Stress
    { duration: '2m', target: 1000 },   // Breaking point
    { duration: '3m', target: 1000 },   // Sustain breaking point
    { duration: '2m', target: 0 },      // Recovery
  ],
  thresholds: {
    // We don't set strict thresholds here - we want to see where it breaks
    'http_req_duration': ['p(99)<5000'],       // 99% under 5s (very lenient)
    'http_req_failed': ['rate<0.50'],          // Allow up to 50% failure at peak
    'api_errors': ['rate<0.50'],
    'system_errors': ['count<1000'],           // Monitor system errors
  },
};

// Environment configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000/api';
const WS_URL = __ENV.WS_URL || 'ws://localhost:4001';

// Test data
const TEST_USER = {
  email: 'stresstest@blockd.test',
  password: 'StressTest123!',
};

// Helper function to make requests with error tracking
function makeRequest(method, url, payload, headers) {
  const start = Date.now();

  try {
    let res;
    if (method === 'GET') {
      res = http.get(url, { headers, timeout: '30s' });
    } else if (method === 'POST') {
      res = http.post(url, payload, { headers, timeout: '30s' });
    }

    const duration = Date.now() - start;
    apiResponseTime.add(duration);

    // Track different types of errors
    if (res.status >= 500) {
      systemErrors.add(1);
      failedRequests.add(1);
      apiErrorRate.add(1);
      return { success: false, status: res.status, error: 'server_error' };
    } else if (res.status >= 400) {
      failedRequests.add(1);
      if (res.status === 429) {
        return { success: false, status: res.status, error: 'rate_limit' };
      } else if (res.status === 503) {
        return { success: false, status: res.status, error: 'service_unavailable' };
      }
      return { success: false, status: res.status, error: 'client_error' };
    } else if (res.status >= 200 && res.status < 300) {
      successfulRequests.add(1);
      return { success: true, status: res.status, data: res.json() };
    }

    return { success: false, status: res.status, error: 'unknown' };
  } catch (e) {
    systemErrors.add(1);
    failedRequests.add(1);
    apiErrorRate.add(1);
    return { success: false, error: 'exception', message: e.toString() };
  }
}

// Login function
function login() {
  const result = makeRequest('POST', `${BASE_URL}/auth/login`, JSON.stringify(TEST_USER), {
    'Content-Type': 'application/json',
  });

  if (result.success && result.data) {
    return result.data.accessToken;
  }

  return null;
}

// Main stress test scenario
export default function () {
  const currentVUs = __VU;
  const iteration = __ITER;

  // Track active connections
  activeConnections.add(1);

  const token = login();

  if (!token) {
    // If login fails under stress, try again after brief pause
    sleep(1);
    return;
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  // Test 1: Create session (all users)
  const sessionPayload = JSON.stringify({
    title: `Stress Test Session VU${currentVUs} Iter${iteration}`,
    candidateName: `Candidate ${currentVUs}`,
    candidateEmail: `stress-${currentVUs}-${iteration}@test.com`,
    position: 'Test Position',
    duration: 30,
    questions: [
      { text: 'Question 1', difficulty: 'easy', category: 'technical' },
    ],
  });

  const createResult = makeRequest('POST', `${BASE_URL}/sessions`, sessionPayload, headers);

  if (!createResult.success) {
    if (createResult.error === 'rate_limit') {
      console.log(`VU ${currentVUs}: Hit rate limit on session creation`);
    } else if (createResult.error === 'service_unavailable') {
      console.log(`VU ${currentVUs}: Service unavailable`);
    }
    sleep(2);
    return;
  }

  const sessionId = createResult.data?.session?.id;

  if (!sessionId) {
    sleep(1);
    return;
  }

  sleep(0.5);

  // Test 2: Heavy concurrent reads
  for (let i = 0; i < 3; i++) {
    makeRequest('GET', `${BASE_URL}/sessions?page=${i + 1}&limit=10`, null, headers);
    sleep(0.1);
  }

  // Test 3: WebSocket stress (50% of users)
  if (Math.random() < 0.5) {
    try {
      ws.connect(`${WS_URL}/ws?sessionId=${sessionId}&token=${token}`, {
        timeout: '15s',
      }, function (socket) {
        socket.on('open', function () {
          // Send burst of messages
          for (let i = 0; i < 10; i++) {
            socket.send(JSON.stringify({
              type: 'stress_test',
              vu: currentVUs,
              iteration: iteration,
              messageNumber: i,
              timestamp: Date.now(),
            }));
          }
        });

        socket.on('error', function (e) {
          if (e.toString().includes('connection')) {
            dbConnectionErrors.add(1);
          }
          systemErrors.add(1);
        });

        socket.setTimeout(function () {
          socket.close();
        }, 2000);
      });
    } catch (e) {
      systemErrors.add(1);
      console.log(`VU ${currentVUs}: WebSocket error - ${e}`);
    }
  }

  sleep(0.5);

  // Test 4: Start session
  makeRequest('POST', `${BASE_URL}/sessions/${sessionId}/start`, '{}', headers);

  sleep(0.3);

  // Test 5: AI detection stress
  const answerPayload = JSON.stringify({
    questionId: 'stress-question',
    answer: `Stress test answer from VU ${currentVUs} iteration ${iteration}. Testing system under extreme load.`,
    sessionId: sessionId,
  });

  const aiResult = makeRequest('POST', `${BASE_URL}/analysis/answer`, answerPayload, headers);

  if (!aiResult.success && aiResult.error === 'server_error') {
    console.log(`VU ${currentVUs}: AI service degraded/failed`);
  }

  sleep(0.5);

  // Test 6: Rapid fire requests to test connection pool
  const rapidFireCount = 5;
  for (let i = 0; i < rapidFireCount; i++) {
    makeRequest('GET', `${BASE_URL}/sessions/${sessionId}`, null, headers);
  }

  sleep(0.5);

  // Test 7: End session
  makeRequest('POST', `${BASE_URL}/sessions/${sessionId}/end`, JSON.stringify({ reason: 'stress_test' }), headers);

  // Random short sleep
  sleep(Math.random() * 0.5);
}

// Setup function
export function setup() {
  console.log('========================================');
  console.log('Starting STRESS TEST');
  console.log('========================================');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`WebSocket URL: ${WS_URL}`);
  console.log('Ramp: 0 → 1000 VUs over 10 minutes');
  console.log('Objective: Find breaking point');
  console.log('========================================');
  console.log('Monitoring:');
  console.log('  - Response times');
  console.log('  - Error rates');
  console.log('  - Connection failures');
  console.log('  - System errors');
  console.log('========================================');
  return { startTime: Date.now() };
}

// Teardown function
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log('========================================');
  console.log('STRESS TEST COMPLETED');
  console.log('========================================');
  console.log(`Duration: ${duration.toFixed(2)}s`);
  console.log('========================================');
  console.log('ANALYSIS RECOMMENDATIONS:');
  console.log('1. Review error rates by load level');
  console.log('2. Identify response time degradation point');
  console.log('3. Check database connection pool exhaustion');
  console.log('4. Monitor WebSocket connection failures');
  console.log('5. Analyze system resource usage');
  console.log('========================================');
}

// Handle interruptions
export function handleSummary(data) {
  return {
    '/home/user/Blockd/tests/reports/stress-test-summary.json': JSON.stringify(data, null, 2),
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
  };
}

// Helper function for text summary (k6 default)
function textSummary(data, options) {
  const indent = options.indent || '';
  const enableColors = options.enableColors !== false;

  let summary = '\n';
  summary += `${indent}Test Summary:\n`;
  summary += `${indent}  Duration: ${(data.state.testRunDurationMs / 1000).toFixed(2)}s\n`;
  summary += `${indent}  Successful Requests: ${data.metrics.successful_requests?.values?.count || 0}\n`;
  summary += `${indent}  Failed Requests: ${data.metrics.failed_requests?.values?.count || 0}\n`;
  summary += `${indent}  System Errors: ${data.metrics.system_errors?.values?.count || 0}\n`;
  summary += `${indent}  Avg Response Time: ${(data.metrics.api_response_time?.values?.avg || 0).toFixed(2)}ms\n`;
  summary += `${indent}  P95 Response Time: ${(data.metrics.api_response_time?.values?.p95 || 0).toFixed(2)}ms\n`;
  summary += `${indent}  P99 Response Time: ${(data.metrics.api_response_time?.values?.p99 || 0).toFixed(2)}ms\n`;

  return summary;
}
