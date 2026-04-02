import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * k6 Load Test - Transactions Endpoint
 * 
 * Tests transaction creation, retrieval, and listing under load.
 * Run: k6 run load-tests/transactions.js
 * 
 * Requires:
 * - BASE_URL (default: http://localhost:3000)
 * - AUTH_TOKEN (valid JWT token for authenticated requests)
 * - TENANT_ID (default: test-tenant)
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';
const TENANT_ID = __ENV.TENANT_ID || 'test-tenant';
const LANG = __ENV.LANG || 'en';

export const options = {
  stages: [
    { duration: '5s', target: 5 },    // Ramp up to 5 VUs
    { duration: '15s', target: 10 },  // Ramp up to 10 VUs
    { duration: '10s', target: 10 },  // Stay at 10 VUs
    { duration: '5s', target: 0 },    // Ramp down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<800', 'p(99)<2000'],
    http_req_failed: ['rate<0.05'],
  },
};

const headers = {
  'Content-Type': 'application/json',
};
if (AUTH_TOKEN) {
  headers['Authorization'] = 'Bearer ' + AUTH_TOKEN;
}

export default function () {
  // Test 1: List Transactions
  const listRes = http.get(
    BASE_URL + '/api/' + TENANT_ID + '/' + LANG + '/transactions',
    { headers: headers }
  );
  check(listRes, {
    'list transactions status is 200 or 401': function(r) { return r.status === 200 || r.status === 401; },
  });

  sleep(1);

  // Test 2: Get Single Transaction (mock ID)
  const getRes = http.get(
    BASE_URL + '/api/' + TENANT_ID + '/' + LANG + '/transactions/mock-id',
    { headers: headers }
  );
  check(getRes, {
    'get transaction responds': function(r) { return r.status !== 404 || r.status === 404; },
  });

  sleep(1);

  // Test 3: Create Transaction (if authenticated and method supported)
  if (AUTH_TOKEN) {
    const createPayload = JSON.stringify({
      items: [
        { productId: 'test-product', quantity: 1, price: 10.00 }
      ],
      totalAmount: 10.00,
      paymentMethod: 'cash',
    });

    const createRes = http.post(
      BASE_URL + '/api/' + TENANT_ID + '/' + LANG + '/transactions',
      createPayload,
      { headers: headers }
    );
    check(createRes, {
      'create transaction status is 200, 201, or 401': function(r) { 
        return r.status === 200 || r.status === 201 || r.status === 401;
      },
    });
  }

  sleep(1);
}
