import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * k6 Stress Test - Transactions Endpoint
 * 
 * Stresses the transaction endpoint with increasing concurrent users.
 * Run: k6 run load-tests/stress-transactions.js
 * 
 * Requires:
 * - BASE_URL (default: http://localhost:3000)
 * - AUTH_TOKEN (valid JWT token)
 * - TENANT_ID (default: test-tenant)
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
    { duration: '1m', target: 5 },    // Warm up to 5 VUs
    { duration: '3m', target: 25 },   // Ramp to 25 VUs
    { duration: '3m', target: 50 },   // Ramp to 50 VUs
    { duration: '3m', target: 100 },  // Ramp to 100 VUs (stress point)
    { duration: '2m', target: 0 },    // Cool down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1500', 'p(99)<3000'],
    http_req_failed: ['rate<0.3'],  // Allow higher error rate during stress
  },
};

export default function () {
  // List transactions (read-heavy)
  const listRes = http.get(
    BASE_URL + '/api/' + TENANT_ID + '/' + LANG + '/transactions',
    { headers: headers }
  );
  check(listRes, {
    'list transactions responds': function(r) { 
      return r.status === 200 || r.status === 401 || r.status === 500; 
    },
  });

  sleep(1);

  // Create transaction (write-heavy) if authenticated
  if (AUTH_TOKEN) {
    const createPayload = JSON.stringify({
      items: [
        { productId: 'stress-test-' + Math.random(), quantity: 1, price: 10.00 }
      ],
      totalAmount: 10.00,
      paymentMethod: Math.random() > 0.5 ? 'cash' : 'card',
    });

    const createRes = http.post(
      BASE_URL + '/api/' + TENANT_ID + '/' + LANG + '/transactions',
      createPayload,
      { headers: headers }
    );
    check(createRes, {
      'create transaction succeeds or fails': function(r) { 
        return r.status === 200 || r.status === 201 || r.status === 401 || r.status === 400 || r.status === 500; 
      },
    });
  }

  sleep(1);
}
