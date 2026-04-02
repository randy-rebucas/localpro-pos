import http from 'k6/http';
import { check, group, sleep } from 'k6';

/**
 * k6 Load Test - Mixed Workload
 * 
 * Simulates realistic user behavior with a mix of read and write operations.
 * Run: k6 run load-tests/mixed-workload.js
 * 
 * Scenario:
 * - Browse products (reads)
 * - View transactions (reads)
 * - Create transactions (writes)
 * - Check inventory (reads)
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';
const TENANT_ID = __ENV.TENANT_ID || 'test-tenant';
const LANG = __ENV.LANG || 'en';

export const options = {
  stages: [
    { duration: '10s', target: 5 },   // Ramp up to 5 VUs
    { duration: '20s', target: 10 },  // Ramp up to 10 VUs
    { duration: '30s', target: 10 },  // Stay at 10 VUs
    { duration: '10s', target: 5 },   // Ramp down to 5 VUs
    { duration: '5s', target: 0 },    // Ramp down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.05'],
    'group_duration{staticAsset:yes}': ['p(99)<300'],
    'group_duration{api:yes}': ['p(99)<1000'],
  },
};

const headers = {
  'Content-Type': 'application/json',
};
if (AUTH_TOKEN) {
  headers['Authorization'] = 'Bearer ' + AUTH_TOKEN;
}

export default function () {
  // Group 1: Read Operations (70%)
  group('API - Read Operations', function() {
    // Get products
    const productsRes = http.get(
      BASE_URL + '/api/' + TENANT_ID + '/' + LANG + '/products',
      { headers: headers }
    );
    check(productsRes, {
      'products list works': function(r) { return r.status === 200 || r.status === 401; },
    });

    sleep(0.5);

    // Get transactions
    const transRes = http.get(
      BASE_URL + '/api/' + TENANT_ID + '/' + LANG + '/transactions',
      { headers: headers }
    );
    check(transRes, {
      'transactions list works': function(r) { return r.status === 200 || r.status === 401; },
    });

    sleep(0.5);
  });

  // Group 2: Write/Mutation Operations (30%)
  if (Math.random() < 0.3 && AUTH_TOKEN) {
    group('API - Write Operations', function() {
      var paymentMethods = ['cash', 'card'];
      const createPayload = JSON.stringify({
        items: [
          { productId: 'test-prod', quantity: Math.floor(Math.random() * 5) + 1, price: 15.00 }
        ],
        totalAmount: 15.00,
        paymentMethod: paymentMethods[Math.floor(Math.random() * 2)],
      });

      const createRes = http.post(
        BASE_URL + '/api/' + TENANT_ID + '/' + LANG + '/transactions',
        createPayload,
        { headers: headers }
      );
      check(createRes, {
        'create transaction succeeds or fails gracefully': function(r) { 
          return r.status === 200 || r.status === 201 || r.status === 401 || r.status === 400;
        },
      });

      sleep(1);
    });
  }

  sleep(Math.random() * 2);
}
