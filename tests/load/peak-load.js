import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

/**
 * Peak Load Test for Blockd Platform
 *
 * Scenario: 500 VUs, 5m duration, 2000 req/min
 * Simulates peak traffic periods (e.g., start of business day, major events)
 */

// Custom metrics
const apiErrorRate = new Rate('api_errors');
const apiResponseTime = new Trend('api_response_time');
const wsConnectionTime = new Trend('ws_connection_time');
const wsConnectionErrors = new Counter('ws_connection_errors');
const sessionCreated = new Counter('sessions_created');
const videoStreamActive = new Counter('video_streams_active');

// Test configuration
export const options = {
  stages: [
    { duration: '1m', target: 100 },   // Fast ramp up to 100
    { duration: '1m', target: 300 },   // Ramp to 300
    { duration: '30s', target: 500 },  // Peak at 500
    { duration: '2m30s', target: 500 },// Hold peak
    { duration: '1m', target: 0 },     // Fast ramp down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500'],        // 95% of requests should be below 500ms (higher threshold for peak)
    'http_req_failed': ['rate<0.05'],          // Error rate should be below 5% (higher tolerance)
    'ws_connecting': ['p(95)<2000'],           // WebSocket connection time < 2s
    'api_errors': ['rate<0.05'],               // API error rate < 5%
    'api_response_time': ['p(95)<600'],        // 95% of API calls < 600ms
    'checks': ['rate>0.90'],                   // 90% of checks should pass
    'ws_connection_errors': ['count<100'],     // Max 100 WS connection errors
  },
};

// Environment configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000/api';
const WS_URL = __ENV.WS_URL || 'ws://localhost:4001';

// Test data
const TEST_USERS = [
  { email: 'loadtest1@blockd.test', password: 'LoadTest123!' },
  { email: 'loadtest2@blockd.test', password: 'LoadTest123!' },
  { email: 'loadtest3@blockd.test', password: 'LoadTest123!' },
];

// Helper function to login
function login() {
  const user = TEST_USERS[__VU % TEST_USERS.length];

  const loginRes = http.post(`${BASE_URL}/auth/login`, JSON.stringify(user), {
    headers: { 'Content-Type': 'application/json' },
  });

  apiResponseTime.add(loginRes.timings.duration);

  const loginSuccess = check(loginRes, {
    'login successful': (r) => r.status === 200,
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
    sleep(0.5);
    return;
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  // Scenario 1: Heavy session creation (50% of users)
  if (Math.random() < 0.5) {
    const sessionPayload = JSON.stringify({
      title: `Peak Test ${__VU}-${__ITER}`,
      candidateName: `Candidate ${__VU}`,
      candidateEmail: `candidate-${__VU}@test.com`,
      position: 'Engineer',
      duration: 60,
      questions: [
        { text: 'Technical question 1', difficulty: 'medium', category: 'technical' },
        { text: 'Technical question 2', difficulty: 'hard', category: 'technical' },
      ],
    });

    const createRes = http.post(`${BASE_URL}/sessions`, sessionPayload, { headers });
    apiResponseTime.add(createRes.timings.duration);

    const success = check(createRes, {
      'session created': (r) => r.status === 201,
    });

    if (success) {
      sessionCreated.add(1);
    } else {
      apiErrorRate.add(1);
    }

    sleep(0.5);
  }

  // Scenario 2: Heavy list queries (30% of users)
  if (Math.random() < 0.3) {
    const listRes = http.get(`${BASE_URL}/sessions?page=${Math.floor(Math.random() * 10) + 1}&limit=20`, { headers });
    apiResponseTime.add(listRes.timings.duration);

    check(listRes, {
      'list sessions ok': (r) => r.status === 200,
    });

    sleep(0.3);
  }

  // Scenario 3: Concurrent WebSocket connections (40% of users)
  if (Math.random() < 0.4) {
    const wsStart = Date.now();
    const sessionId = `session-${__VU}-${__ITER}`;

    try {
      ws.connect(`${WS_URL}/ws?sessionId=${sessionId}&token=${token}`, {
        timeout: '10s',
      }, function (socket) {
        const wsConnectTime = Date.now() - wsStart;
        wsConnectionTime.add(wsConnectTime);

        socket.on('open', function () {
          // Simulate rapid message sending
          for (let i = 0; i < 5; i++) {
            socket.send(JSON.stringify({
              type: 'security_event',
              severity: 'low',
              timestamp: Date.now(),
            }));
            sleep(0.1);
          }

          videoStreamActive.add(1);
        });

        socket.on('message', function (data) {
          check(data, { 'ws message received': true });
        });

        socket.on('error', function (e) {
          wsConnectionErrors.add(1);
        });

        // Hold connection for 3 seconds
        socket.setTimeout(function () {
          socket.close();
        }, 3000);
      });
    } catch (e) {
      wsConnectionErrors.add(1);
    }

    sleep(1);
  }

  // Scenario 4: AI detection under load (20% of users)
  if (Math.random() < 0.2) {
    const answerPayload = JSON.stringify({
      questionId: `q-${__VU}`,
      answer: 'This is a test answer for load testing the AI detection service under peak load conditions.',
      sessionId: `session-${__VU}`,
    });

    const aiRes = http.post(`${BASE_URL}/analysis/answer`, answerPayload, { headers });
    apiResponseTime.add(aiRes.timings.duration);

    check(aiRes, {
      'ai analysis ok': (r) => r.status === 200 || r.status === 202,
    });

    sleep(0.5);
  }

  // Scenario 5: Random reads (30% of users)
  if (Math.random() < 0.3) {
    const sessionId = `test-session-${Math.floor(Math.random() * 100)}`;

    const getRes = http.get(`${BASE_URL}/sessions/${sessionId}`, { headers });
    apiResponseTime.add(getRes.timings.duration);

    check(getRes, {
      'get session response': (r) => r.status === 200 || r.status === 404,
    });

    sleep(0.2);
  }

  // Small random sleep to prevent perfect synchronization
  sleep(Math.random() * 0.5);
}

// Setup function
export function setup() {
  console.log('======================================');
  console.log('Starting PEAK LOAD test...');
  console.log('======================================');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`WebSocket URL: ${WS_URL}`);
  console.log('Target: 500 VUs, ~2000 req/min');
  console.log('Duration: 5 minutes');
  console.log('======================================');
  return { startTime: Date.now() };
}

// Teardown function
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log('======================================');
  console.log(`Peak load test completed in ${duration.toFixed(2)}s`);
  console.log('======================================');
}
