# Stress Testing Quick Start

## What Was Set Up

✅ **4 stress test scripts** — API, Transactions, Spike, Endurance  
✅ **npm commands** — Quick shortcuts to run stress tests  
✅ **Comprehensive documentation** — Full guide in `load-tests/STRESS_TESTING.md`  
✅ **Breaking point detection** — Find system limits

## Stress Tests Explained

| Test | Purpose | Duration | Max Load |
|------|---------|----------|----------|
| **Gradual Stress** | Find breaking point | 19 min | 200 VUs |
| **Spike Test** | Test sudden traffic | 4 min | 150 VUs |
| **Endurance** | Check stability | 11 min | 30 VUs |
| **Transaction** | DB/write stress | 10 min | 100 VUs |

## Quick Commands

```bash
# Start your dev server
pnpm run dev

# Run gradual stress test (find breaking point)
pnpm run stress:api

# Test transaction endpoint under stress
pnpm run stress:transactions -- \
  -e AUTH_TOKEN=your_jwt_token \
  -e TENANT_ID=your-tenant

# Simulate sudden traffic spike
pnpm run stress:spike -- \
  -e AUTH_TOKEN=your_jwt_token

# Run long-duration stability test
pnpm run stress:endurance -- \
  -e AUTH_TOKEN=your_jwt_token \
  -e TENANT_ID=your-tenant

# Run all stress tests sequentially
pnpm run stress:all -- \
  -e AUTH_TOKEN=your_jwt_token \
  -e TENANT_ID=your-tenant
```

## What to Monitor

| Metric | Good | Warning | Breaking |
|--------|------|---------|----------|
| **p95 Response** | <500ms | 800ms | >2000ms |
| **p99 Response** | <1000ms | 1500ms | >5000ms |
| **Error Rate** | <1% | 5% | >25% |
| **Max Throughput** | +50%↑ from load test | -30% from baseline | crashes |

## Typical Results

### When Tests PASS ✅
```
✓ http_req_duration: p(95)=450ms p(99)=850ms
✓ http_req_failed: rate=0.8%
→ Action: System can handle this load. Increase and retest.
```

### When Tests WARN ⚠️
```
✗ http_req_duration: p(95)=1200ms (exceeded 1000ms threshold)
✓ http_req_failed: rate=2%
→ Action: Performance degrading. Optimize queries/caching.
```

### When Tests FAIL ❌
```
✗ http_req_failed: rate=35% (exceeded 25% threshold)
✗ http_req_duration: p(95)=3500ms
→ Action: STOP. System failing. Check error logs immediately.
```

## Files Created

```
load-tests/
├── stress-api.js              # Gradual load escalation test
├── stress-transactions.js     # Transaction endpoint stress
├── stress-spike.js            # Sudden traffic spike
├── stress-endurance.js        # 10-minute stability test
└── STRESS_TESTING.md          # Complete documentation

package.json scripts added:
- pnpm run stress:api
- pnpm run stress:transactions
- pnpm run stress:spike
- pnpm run stress:endurance
- pnpm run stress:all
```

## Test Sequence

**Recommended approach:**

1. **Run baseline load test first**
   ```bash
   pnpm run load:test:api
   ```
   Note down the metrics.

2. **Start with spike test** (shortest)
   ```bash
   pnpm run stress:spike
   ```
   See how system handles sudden load.

3. **Run gradual stress test** (finds breaking point)
   ```bash
   pnpm run stress:api
   ```
   Watch for where performance degrades.

4. **Run endurance test** (validates stability)
   ```bash
   pnpm run stress:endurance
   ```
   Check for memory leaks and connection issues.

5. **Document your breaking point**
   - Max sustainable VUs
   - Error threshold
   - Recommended request timeout

## Breaking Point Analysis

After the **Gradual Stress Test**, you'll see output like:

```
Stage 1: 10 VUs → ✅ 0% errors, 150ms p(95)
Stage 2: 50 VUs → ✅ 0.5% errors, 420ms p(95)
Stage 3: 100 VUs → ⚠️ 3% errors, 1100ms p(95)
Stage 4: 200 VUs → ❌ 45% errors, 4500ms p(95)
```

**Breaking point = 100 VUs** (last stage before significant degradation)

Recommendations:
- Set max connections/VUs to **80-90% of breaking point**
- Configure alerts if error rate exceeds **5%**
- Plan for horizontal scaling at **70% capacity**

## Environment Variables

- `BASE_URL` — Server URL (default: `http://localhost:3000`)
- `AUTH_TOKEN` — JWT for authenticated tests
- `TENANT_ID` — Multi-tenant identifier (default: `test-tenant`)
- `LANG` — Language code (default: `en`)

## Next Steps

1. Run a stress test: `pnpm run stress:api`
2. Monitor the output for threshold violations
3. Check server logs and CPU/memory usage
4. Document your system's breaking point
5. Optimize hot paths (database queries, API logic, etc.)
6. Rerun to verify improvements

See [STRESS_TESTING.md](load-tests/STRESS_TESTING.md) for detailed scenarios and troubleshooting.

