# Load Testing with k6

This directory contains load testing scripts for the 1POS system using [k6](https://k6.io/).

## Setup

k6 is already installed as a dev dependency. Make sure your environment is ready:

```bash
pnpm install
```

## Running Tests

### Basic API Endpoints Test
```bash
k6 run load-tests/api-endpoints.js
```

### Authentication Test
Requires test credentials:
```bash
k6 run load-tests/auth.js \
  -e BASE_URL=http://localhost:3000 \
  -e TEST_EMAIL=test@example.com \
  -e TEST_PASSWORD=yourpassword
```

### Transactions Test
Requires authentication token:
```bash
k6 run load-tests/transactions.js \
  -e BASE_URL=http://localhost:3000 \
  -e AUTH_TOKEN=your_jwt_token \
  -e TENANT_ID=your-tenant \
  -e LANG=en
```

### Mixed Workload Test
Simulates realistic user behavior with mixed read/write operations:
```bash
k6 run load-tests/mixed-workload.js \
  -e BASE_URL=http://localhost:3000 \
  -e AUTH_TOKEN=your_jwt_token \
  -e TENANT_ID=your-tenant \
  -e LANG=en
```

## Environment Variables

- `BASE_URL` — API server URL (default: `http://localhost:3000`)
- `AUTH_TOKEN` — JWT authentication token for protected endpoints
- `TENANT_ID` — Multi-tenant identifier (default: `test-tenant`)
- `LANG` — Language code for localized endpoints (default: `en`)
- `TEST_EMAIL` — Test user email for auth tests
- `TEST_PASSWORD` — Test user password for auth tests

## Configuration

Each test script defines:

- **VUs (Virtual Users)** — Number of concurrent simulated users
- **Duration** — How long the test runs
- **Stages** — Ramp-up/ramp-down profiles for realistic scaling
- **Thresholds** — Pass/fail criteria for performance metrics

### Key Metrics

- `http_req_duration` — Response time (p95, p99 percentiles)
- `http_req_failed` — Error rate threshold
- `group_duration` — Time spent in grouped operations

## Performance Targets

Current thresholds:

| Metric | Target |
|--------|--------|
| 95th percentile response time | < 500–1000ms |
| 99th percentile response time | < 1000–2000ms |
| Error rate | < 5–10% |

Adjust these in each script's `options.thresholds` based on your SLAs.

## Results & Analysis

k6 provides detailed HTML and JSON reports. To generate a report:

```bash
k6 run load-tests/api-endpoints.js \
  --out json=load-tests/results.json \
  --out html=load-tests/results.html
```

Then open `load-tests/results.html` in your browser.

## CI/CD Integration

Add to your CI pipeline:

```bash
k6 run load-tests/api-endpoints.js --vus 20 --duration 60s
```

This can catch performance regressions in automated workflows.

## Best Practices

1. **Test before production changes** — Run baseline tests to compare against.
2. **Use realistic data** — Test with data similar to production.
3. **Gradual ramp-up** — Avoid sudden spikes; use stages to simulate realistic traffic.
4. **Monitor thresholds** — Fail the test if key metrics exceed limits.
5. **Isolate components** — Run focused tests on specific endpoints to identify bottlenecks.

## Troubleshooting

### Connection Refused
- Ensure dev server is running: `pnpm run dev`
- Check `BASE_URL` is correct

### 401 Unauthorized
- Provide valid `AUTH_TOKEN`
- Check JWT expiration

### High Response Times
- Reduce VUs in the script
- Check database performance
- Review API route implementation

## Resources

- [k6 Official Docs](https://k6.io/docs/)
- [k6 Scripting Guide](https://k6.io/docs/using-k6/http-requests/)
- [k6 Thresholds](https://k6.io/docs/using-k6/thresholds/)

