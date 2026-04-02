import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * k6 Stress Test - Spike Test
 * 
 * Simulates sudden traffic spikes to test system resilience.
 * Run: k6 run load-tests/stress-spike.js
 * 
 * Scenario: Normal load → Sudden spike → Back to normal
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
    { duration: '30s', target: 10 },  // Normal load
    { duration: '1m30s', target: 150 },  // Sudden spike in 1.5 minutes
    { duration: '1m', target: 150 },    // Sustained spike
    { duration: '30s', target: 10 },   // Back to normal
    { duration: '30s', target: 0 },    // Cool down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],  // Relaxed during spike
    http_req_failed: ['rate<0.4'],                     // Allow higher errors during spike
  },
};

export default function () {
  // Mix of read and write operations
  const isWrite = Math.random() > 0.6;

  if (isWrite && AUTH_TOKEN) {
    // Write operation
    const payload = JSON.stringify({
      items: [{ productId: 'spike-' + Date.now(), quantity: 1, price: 10.00 }],
      totalAmount: 10.00,
      paymentMethod: 'cash',
    });

    const res = http.post(
      BASE_URL + '/api/' + TENANT_ID + '/' + LANG + '/transactions',
      payload,
      { headers: headers }
    );
    check(res, {
      'write succeeds or fails': function(r) { 
        return r.status < 600; 
      },
    });
  } else {
    // Read operation
    const res = http.get(
      BASE_URL + '/api/' + TENANT_ID + '/' + LANG + '/transactions',
      { headers: headers }
    );
    check(res, {
      'read succeeds or fails': function(r) { 
        return r.status < 600; 
      },
    });
  }

  sleep(0.5);
}
