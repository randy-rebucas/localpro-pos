import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * k6 Load Test - API Endpoints
 * 
 * Tests core POS API endpoints for performance and stability.
 * Run: k6 run load-tests/api-endpoints.js
 * 
 * Configuration:
 * - Virtual Users (VUs): 10
 * - Test Duration: 30 seconds
 * - Ramp-up: 5 seconds
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TENANT_ID = __ENV.TENANT_ID || 'default-tenant';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

export const options = {
  stages: [
    { duration: '5s', target: 10 },   // Ramp up to 10 VUs
    { duration: '20s', target: 10 },  // Stay at 10 VUs
    { duration: '5s', target: 0 },    // Ramp down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],  // 95% requests < 500ms, 99% < 1000ms
    http_req_failed: ['rate<0.1'],                    // Error rate < 10%
  },
};

export default function () {
  // Test 1: Health Check
  const healthRes = http.get(BASE_URL + '/api/health');
  check(healthRes, {
    'health check status is 200': function(r) { return r.status === 200; },
  });

  sleep(1);

  // Test 2: Get Products (if tenant context available)
  const productsHeaders = {
    'Content-Type': 'application/json',
  };
  if (AUTH_TOKEN) {
    productsHeaders['Authorization'] = 'Bearer ' + AUTH_TOKEN;
  }
  const productsRes = http.get(BASE_URL + '/api/products', {
    headers: productsHeaders,
  });
  check(productsRes, {
    'products endpoint status is 200 or 401': function(r) { return r.status === 200 || r.status === 401; },
  });

  sleep(1);

  // Test 3: API Availability (Generic)
  const apiRes = http.get(BASE_URL + '/api');
  check(apiRes, {
    'api root is accessible': function(r) { return r.status !== 404; },
  });

  sleep(1);
}
