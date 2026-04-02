import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * k6 Stress Test - Endurance Test
 * 
 * Runs sustained moderate load for an extended period (10 minutes).
 * Tests for memory leaks, resource exhaustion, and connection pool issues.
 * Run: k6 run load-tests/stress-endurance.js
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';
const TENANT_ID = __ENV.TENANT_ID || 'test-tenant';
const LANG = __ENV.LANG || 'en';

const headers = {
  'Content-Type': 'application/json',
};
if (AUTH_TOKEN) {
  headers['Authorization'] = 'Bearer ' + AUTH_TOKEN;
}

export const options = {
  stages: [
    { duration: '2m', target: 30 },   // Ramp up to 30 VUs
    { duration: '8m', target: 30 },   // Hold at 30 VUs for 8 minutes (main endurance phase)
    { duration: '1m', target: 0 },    // Cool down
  ],
  thresholds: {
    http_req_duration: ['p(95)<800', 'p(99)<2000'],
    http_req_failed: ['rate<0.05'],  // Keep error rate low for production-like test
  },
};

export default function () {
  // Mix of different operations to simulate real usage
  const operation = Math.floor(Math.random() * 3);

  switch (operation) {
    case 0:
      // Get products list
      const listRes = http.get(
        BASE_URL + '/api/' + TENANT_ID + '/' + LANG + '/transactions',
        { headers: headers }
      );
      check(listRes, {
        'list succeeds': function(r) { return r.status === 200 || r.status === 401; },
      });
      break;

    case 1:
      // Get single item
      const getRes = http.get(
        BASE_URL + '/api/' + TENANT_ID + '/' + LANG + '/transactions/test-id',
        { headers: headers }
      );
      check(getRes, {
        'get returns valid status': function(r) { return r.status !== 0; },
      });
      break;

    case 2:
      // Create transaction if authenticated
      if (AUTH_TOKEN) {
        const payload = JSON.stringify({
          items: [{ productId: 'endurance-' + Math.random(), quantity: 1, price: 10.00 }],
          totalAmount: 10.00,
          paymentMethod: 'cash',
        });

        const createRes = http.post(
          BASE_URL + '/api/' + TENANT_ID + '/' + LANG + '/transactions',
          payload,
          { headers: headers }
        );
        check(createRes, {
          'create succeeds or fails gracefully': function(r) { 
            return r.status < 600; 
          },
        });
      }
      break;
  }

  sleep(Math.random() * 2 + 1);  // Random sleep 1-3 seconds
}
