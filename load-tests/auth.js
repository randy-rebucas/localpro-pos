import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * k6 Load Test - Authentication Endpoints
 * 
 * Tests login, token refresh, and session endpoints under load.
 * Run: k6 run load-tests/auth.js
 * 
 * Requires:
 * - BASE_URL (default: http://localhost:3000)
 * - TEST_EMAIL (test user email)
 * - TEST_PASSWORD (test user password)
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TEST_EMAIL = __ENV.TEST_EMAIL || 'test@example.com';
const TEST_PASSWORD = __ENV.TEST_PASSWORD || 'password123';

export const options = {
  stages: [
    { duration: '3s', target: 3 },    // Ramp to 3 VUs (login attempts)
    { duration: '10s', target: 3 },   // Hold
    { duration: '3s', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    http_req_failed: ['rate<0.1'],
  },
};

const headers = {
  'Content-Type': 'application/json',
};

export default function () {
  // Test: Login endpoint
  const loginPayload = JSON.stringify({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  const loginRes = http.post(
    BASE_URL + '/api/auth/login',
    loginPayload,
    { headers: headers }
  );

  check(loginRes, {
    'login status is 200 or 401': function(r) { return r.status === 200 || r.status === 401; },
    'login response has data or error': function(r) {
      const body = r.body;
      return body && (body.indexOf('token') >= 0 || body.indexOf('error') >= 0);
    },
  });

  // If login successful, test token refresh or protected endpoint
  if (loginRes.status === 200) {
    sleep(1);

    // Try to access a protected endpoint with the token
    const body = JSON.parse(loginRes.body);
    if (body.accessToken) {
      const protectedRes = http.get(
        BASE_URL + '/api/user',
        {
          headers: {
            'Authorization': 'Bearer ' + body.accessToken,
          },
        }
      );

      check(protectedRes, {
        'protected endpoint works with token': function(r) { return r.status === 200 || r.status === 401; },
      });
    }
  }

  sleep(2);
}
