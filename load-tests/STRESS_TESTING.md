# Stress Testing with k6

This directory contains stress testing scripts designed to push your 1POS system to its limits and identify breaking points.

## Stress Testing vs Load Testing

| Aspect | Load Testing | Stress Testing |
|--------|--------------|---|
| **Goal** | Measure performance under expected load | Find breaking point |
| **Load pattern** | Realistic, consistent | Escalating or spiking |
| **Duration** | Short to medium | Medium to long |
| **Success criteria** | Meet performance SLAs | Identify failure points |

## Stress Test Types

### 1. **Gradual Stress Test** (`stress-api.js`)
Gradually increases load from 10 to 200 virtual users over 19 minutes.

```bash
k6 run load-tests/stress-api.js
```

**Best for:**
- Finding the system's maximum capacity
- Identifying performance degradation patterns
- Detecting resource exhaustion

**What to watch for:**
- Response time increases
- Error rate spikes
- Memory or CPU saturation

---

### 2. **Transaction Stress Test** (`stress-transactions.js`)
Stress tests the transaction endpoint with both reads and writes.

```bash
k6 run load-tests/stress-transactions.js \
  -e AUTH_TOKEN=your_jwt_token \
  -e TENANT_ID=your-tenant
```

**Best for:**
- Testing database performance under write load
- Validating transaction integrity
- Finding contention issues

---

### 3. **Spike Test** (`stress-spike.js`)
Simulates sudden traffic spikes to test resilience.

```bash
k6 run load-tests/stress-spike.js \
  -e AUTH_TOKEN=your_jwt_token \
  -e TENANT_ID=your-tenant
```

**Best for:**
- Testing queue management
- Validating circuit breaker behavior
- Checking recovery time after a spike

**Scenario:**
- 10 VUs for 30 seconds (normal)
- Ramp to 150 VUs in 1.5 minutes (spike)
- Hold at 150 VUs for 1 minute
- Return to 10 VUs

---

### 4. **Endurance Test** (`stress-endurance.js`)
Runs moderate load (30 VUs) for 10 minutes to detect slow degradation.

```bash
k6 run load-tests/stress-endurance.js \
  -e AUTH_TOKEN=your_jwt_token \
  -e TENANT_ID=your-tenant
```

**Best for:**
- Detecting memory leaks
- Finding connection pool problems
- Validating long-term stability

**Timeline:**
- 2 minutes ramp-up
- 8 minutes sustained load
- 1 minute cool-down

---

## Running Stress Tests

### Prerequisites

1. **Dev server running**
   ```bash
   pnpm run dev
   ```

2. **Valid authentication token** (for authenticated tests)
   ```bash
   # Get token from your test user login
   AUTH_TOKEN=your_jwt_token
   ```

3. **Tenant ID** (for multi-tenant tests)
   ```bash
   TENANT_ID=your-tenant-id
   ```

### npm Scripts

```bash
pnpm run stress:api           # Gradual stress test
pnpm run stress:transactions  # Transaction endpoint stress
pnpm run stress:spike         # Spike test
pnpm run stress:endurance     # Endurance test
pnpm run stress:all          # Run all stress tests sequentially
```

### Custom Command

```bash
k6 run load-tests/stress-api.js \
  --vus 10 \
  --duration 30s \
  --env BASE_URL=http://localhost:3000
```

---

## Performance Baselines

Set these based on your application requirements:

| Metric | Idle | Normal | Peak | Breaking |
|--------|------|--------|------|----------|
| **95th % Response** | 100ms | 300ms | 800ms | >2000ms |
| **99th % Response** | 200ms | 500ms | 1500ms | >5000ms |
| **Error Rate** | <0.1% | <1% | <5% | >25% |
| **Throughput** | 100 req/s | 500 req/s | 1000 req/s | ? |

---

## Interpreting Results

### Good Performance (Passing)
```
✓ http_req_duration: OK (p(95)<1000)
✓ http_req_failed: OK (rate<0.25)
✓ iterations: 500 complete
```
**Action:** System handles the stress level. Try higher load.

### Degradation (Warning)
```
✗ http_req_duration: EXCEEDED (p(95)=2500)
✓ http_req_failed: OK (rate<0.25)
```
**Action:** Performance degrading. Check response times. Optimize hot paths.

### Failure (Critical)
```
✗ http_req_failed: EXCEEDED (rate=0.4)
✗ http_req_duration: EXCEEDED (p(95)>5000)
```
**Action:** System breaking. Stop, investigate errors. Check logs.

---

## Finding Your Breaking Point

**Approach:**

1. **Establish baseline** with load test (`load:test:api`)
2. **Start stress test** with `stress:api`
3. **Monitor in real-time**:
   - Watch k6 output for threshold violations
   - Monitor server logs for errors
   - Check system resources (CPU, memory, connections)
4. **Identify breaking point** where:
   - Error rate jumps significantly
   - Response times become unacceptable
   - Database connections max out
5. **Document findings**:
   - Max sustainable throughput
   - Recommended request timeout
   - Optimal connection pool size

---

## Advanced: Custom Stress Scenarios

Modify thresholds, stages, or checks:

```javascript
export const options = {
  stages: [
    { duration: '1m', target: 50 },   // Start at 50
    { duration: '10m', target: 500 }, // Escalate over 10 minutes
    { duration: '2m', target: 0 },    // Cool down fast
  ],
  thresholds: {
    http_req_duration: ['p(99)<3000'],  // Adjust percentile and time
    http_req_failed: ['rate<0.1'],
  },
};
```

---

## Troubleshooting

### Server crashes during test
- **Issue:** Out of memory or max connections exceeded
- **Solution:** Lower starting VUs or add pauses between requests

### Many 503 Service Unavailable errors
- **Issue:** Overloaded or circuit breaker triggered
- **Solution:** Test has found breaking point — document and optimize

### k6 tool not found
- **Issue:** k6 binary not in PATH
- **Solution:** Restart terminal or reinstall k6

---

## Resources

- [k6 Stress Testing Guide](https://k6.io/docs/testing-types/stress-testing/)
- [k6 Thresholds](https://k6.io/docs/using-k6/thresholds/)
- [Finding Breaking Points](https://k6.io/blog/how-to-run-stress-testing/)

