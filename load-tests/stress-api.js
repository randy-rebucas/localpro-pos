import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * k6 Stress Test - API Endpoints
 * 
 * Gradually increases load until the system breaks or degrades significantly.
 * Run: k6 run load-tests/stress-api.js
 * 
 * Configuration:
 * - Starts at 10 VUs
 * - Ramps up to 100 VUs over 5 minutes
 * - Tests at sustained peak load
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  stages: [
    { duration: '2m', target: 10 },   // Warm up to 10 VUs
    { duration: '5m', target: 50 },   // Ramp to 50 VUs
    { duration: '5m', target: 100 },  // Ramp to 100 VUs
    { duration: '2m', target: 200 },  // Push to 200 VUs (stress point)
    { duration: '5m', target: 0 },    // Cool down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],  // Response time thresholds
    http_req_failed: ['rate<0.25'],                    // Fail if error rate > 25%
  },
};

export default function () {
  // Simple health check
  const healthRes = http.get(BASE_URL + '/api/health');
  check(healthRes, {
    'health check status is 200': function(r) { return r.status === 200; },
  });

  sleep(0.5);

  // API root accessibility
  const apiRes = http.get(BASE_URL + '/api');
  check(apiRes, {
    'api accessible': function(r) { return r.status !== 404; },
  });

  sleep(0.5);
}
