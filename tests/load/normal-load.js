import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

/**
 * Normal Load Test for Blockd Platform
 *
 * Scenario: 100 VUs, 10m duration, 500 req/min
 * Simulates typical production load
 */

// Custom metrics
const apiErrorRate = new Rate('api_errors');
const apiResponseTime = new Trend('api_response_time');
const wsConnectionTime = new Trend('ws_connection_time');
const sessionCreated = new Counter('sessions_created');
const questionsAnswered = new Counter('questions_answered');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 20 },   // Ramp up to 20 users
    { duration: '2m', target: 50 },   // Ramp up to 50 users
    { duration: '2m', target: 100 },  // Ramp up to 100 users
    { duration: '4m', target: 100 },  // Stay at 100 users
    { duration: '2m', target: 0 },    // Ramp down to 0 users
  ],
  thresholds: {
    'http_req_duration': ['p(95)<200'],        // 95% of requests should be below 200ms
    'http_req_failed': ['rate<0.01'],          // Error rate should be below 1%
    'ws_connecting': ['p(95)<1000'],           // WebSocket connection time < 1s
    'api_errors': ['rate<0.01'],               // API error rate < 1%
    'api_response_time': ['p(95)<250'],        // 95% of API calls < 250ms
    'checks': ['rate>0.95'],                   // 95% of checks should pass
  },
};

// Environment configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000/api';
const WS_URL = __ENV.WS_URL || 'ws://localhost:4001';

// Test data
const TEST_USER = {
  email: 'loadtest@blockd.test',
  password: 'LoadTest123!',
};

// Helper function to login and get auth token
function login() {
  const loginRes = http.post(`${BASE_URL}/auth/login`, JSON.stringify(TEST_USER), {
    headers: { 'Content-Type': 'application/json' },
  });

  apiResponseTime.add(loginRes.timings.duration);

  const loginSuccess = check(loginRes, {
    'login successful': (r) => r.status === 200,
    'login has token': (r) => r.json('accessToken') !== undefined,
  });

  if (!loginSuccess) {
    apiErrorRate.add(1);
    return null;
  }

  return loginRes.json('accessToken');
}

// Main test scenario
export default function () {
  const token = login();

  if (!token) {
    console.error('Failed to login');
    sleep(1);
    return;
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  // Test 1: Create session
  const sessionPayload = JSON.stringify({
    title: `Load Test Session ${__VU}-${__ITER}`,
    candidateName: 'Load Test Candidate',
    candidateEmail: `candidate-${__VU}-${__ITER}@test.com`,
    position: 'Software Engineer',
    duration: 60,
    questions: [
      {
        text: 'Explain REST API design principles',
        difficulty: 'medium',
        category: 'technical',
      },
    ],
  });

  const createSessionRes = http.post(`${BASE_URL}/sessions`, sessionPayload, { headers });

  apiResponseTime.add(createSessionRes.timings.duration);

  const sessionCreatedSuccess = check(createSessionRes, {
    'session created': (r) => r.status === 201,
    'session has ID': (r) => r.json('session.id') !== undefined,
  });

  if (!sessionCreatedSuccess) {
    apiErrorRate.add(1);
    sleep(2);
    return;
  }

  sessionCreated.add(1);
  const sessionId = createSessionRes.json('session.id');

  sleep(1);

  // Test 2: Get session details
  const getSessionRes = http.get(`${BASE_URL}/sessions/${sessionId}`, { headers });

  apiResponseTime.add(getSessionRes.timings.duration);

  check(getSessionRes, {
    'get session successful': (r) => r.status === 200,
    'session details correct': (r) => r.json('session.id') === sessionId,
  });

  sleep(1);

  // Test 3: List sessions
  const listSessionsRes = http.get(`${BASE_URL}/sessions?page=1&limit=10`, { headers });

  apiResponseTime.add(listSessionsRes.timings.duration);

  check(listSessionsRes, {
    'list sessions successful': (r) => r.status === 200,
    'sessions array exists': (r) => Array.isArray(r.json('sessions')),
  });

  sleep(1);

  // Test 4: WebSocket connection (20% of users)
  if (Math.random() < 0.2) {
    const wsStart = Date.now();

    ws.connect(`${WS_URL}/ws?sessionId=${sessionId}&token=${token}`, function (socket) {
      const wsConnectTime = Date.now() - wsStart;
      wsConnectionTime.add(wsConnectTime);

      socket.on('open', function () {
        check(null, {
          'ws connected': true,
        });

        // Send a message
        socket.send(JSON.stringify({
          type: 'ping',
          timestamp: Date.now(),
        }));
      });

      socket.on('message', function (data) {
        check(data, {
          'ws message received': true,
        });
      });

      socket.on('close', function () {
        check(null, {
          'ws closed gracefully': true,
        });
      });

      socket.on('error', function (e) {
        console.error('WebSocket error:', e);
      });

      // Keep connection open for 5 seconds
      socket.setTimeout(function () {
        socket.close();
      }, 5000);
    });

    sleep(2);
  }

  // Test 5: Start session
  const startSessionRes = http.post(`${BASE_URL}/sessions/${sessionId}/start`, '{}', { headers });

  apiResponseTime.add(startSessionRes.timings.duration);

  check(startSessionRes, {
    'start session successful': (r) => r.status === 200,
    'session status is in_progress': (r) => r.json('session.status') === 'in_progress',
  });

  sleep(2);

  // Test 6: Submit answer (simulate AI detection)
  const answerPayload = JSON.stringify({
    questionId: 'test-question-1',
    answer: 'REST API design should follow principles like statelessness, resource-based URLs, and proper HTTP methods.',
    sessionId: sessionId,
  });

  const submitAnswerRes = http.post(`${BASE_URL}/analysis/answer`, answerPayload, { headers });

  apiResponseTime.add(submitAnswerRes.timings.duration);

  check(submitAnswerRes, {
    'answer submitted': (r) => r.status === 200,
    'analysis returned': (r) => r.json('analysis') !== undefined,
  });

  questionsAnswered.add(1);

  sleep(1);

  // Test 7: Get security events
  const eventsRes = http.get(`${BASE_URL}/sessions/${sessionId}/events`, { headers });

  apiResponseTime.add(eventsRes.timings.duration);

  check(eventsRes, {
    'get events successful': (r) => r.status === 200,
    'events array exists': (r) => Array.isArray(r.json('events')),
  });

  sleep(1);

  // Test 8: End session
  const endSessionRes = http.post(`${BASE_URL}/sessions/${sessionId}/end`, JSON.stringify({ reason: 'completed' }), { headers });

  apiResponseTime.add(endSessionRes.timings.duration);

  check(endSessionRes, {
    'end session successful': (r) => r.status === 200,
    'session status is completed': (r) => r.json('session.status') === 'completed',
  });

  sleep(2);
}

// Setup function (runs once at the start)
export function setup() {
  console.log('Starting normal load test...');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`WebSocket URL: ${WS_URL}`);
  console.log('Target: 100 VUs, ~500 req/min');
  return { startTime: Date.now() };
}

// Teardown function (runs once at the end)
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`Test completed in ${duration}s`);
}
