# Load Testing Quick Start

## What Was Set Up

✅ **k6 installed** — Modern load testing tool (binary in `node_modules/.bin/k6.exe`)  
✅ **4 test scripts** — API, Auth, Transactions, Mixed Workload  
✅ **npm commands** — Quick shortcuts to run tests  
✅ **README with guide** — Full documentation in `load-tests/README.md`  
✅ **k6 configured** — Proper stages, thresholds, and performance targets

## System Requirements

- k6 v0.51.0+ (Windows binary already set up)
- Dev server running at `http://localhost:3000`

## Quick Commands

```bash
# Run basic API test (no auth required)
pnpm run load:test:api

# Run auth test (requires test credentials)
pnpm run load:test:auth -- \
  -e TEST_EMAIL=test@example.com \
  -e TEST_PASSWORD=yourpassword

# Run transactions test (requires auth token)
pnpm run load:test:transactions -- \
  -e AUTH_TOKEN=your_jwt_token \
  -e TENANT_ID=your-tenant

# Run realistic mixed workload
pnpm run load:test:mixed -- \
  -e AUTH_TOKEN=your_jwt_token \
  -e TENANT_ID=your-tenant

# Run all tests and generate HTML report
pnpm run load:test:report -- \
  -e AUTH_TOKEN=your_jwt_token \
  -e TENANT_ID=your-tenant
```

## Next Steps

1. **Start your dev server** — `pnpm run dev`
2. **Run a basic test** — `pnpm run load:test:api`
3. **Real testing** — Use auth tokens to test protected endpoints
4. **Analyze results** — Check console output or generated HTML report

## Files Created

```
load-tests/
├── api-endpoints.js      # Basic API health check & endpoints
├── auth.js               # Login and session tests  
├── transactions.js       # Transaction CRUD operations
├── mixed-workload.js     # Realistic user behavior simulation
└── README.md             # Full documentation

package.json scripts added:
- pnpm run load:test:api
- pnpm run load:test:auth
- pnpm run load:test:transactions
- pnpm run load:test:mixed
- pnpm run load:test:all
- pnpm run load:test:report
```

## Key Features

- **Gradual ramp-up** — Simulates realistic user scaling via stages
- **Performance thresholds** — Tests fail if metrics exceed targets
- **Multi-tenant support** — Built-in tenant & language variables
- **Detailed metrics** — Response times, error rates, percentiles
- **k6-compatible syntax** — Pure JS, no modern features k6 doesn't support

## Performance Targets

| Metric | Target |
|--------|--------|
| 95th percentile response | < 500ms |
| 99th percentile response | < 1000ms |
| Error rate | < 10% |

## Common Issues

**Server not running?** — Start with `pnpm run dev` before running tests.

**No test results?** — Ensure `BASE_URL` points to your running server, or provide it: `--env BASE_URL=http://localhost:3000`

Ready to test! 📊



