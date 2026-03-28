# Test Coverage Map

> Auto-verifiable with `pnpm run test:alignment`
> Last verified: 2026-03-28 · 857 tests · 33 files · 0 failures

---

## How It Works

```
TEST_CHECKLIST.md         scripts/check-alignment.ts        __tests__/
──────────────────        ──────────────────────────        ──────────────────────
 § 1. Authentication  ──►  parses sections & statuses  ──►  auth.test.ts
 § 2. Tenants         ──►  maps to test file(s)         ──►  api-tenants.test.ts
 …                    ──►  checks file exists           ──►  …
 § 33. Utilities      ──►  exit 0 = aligned             ──►  api-pwa-utilities.test.ts
```

Run at any time:

```bash
pnpm run test            # run all tests (must pass first)
pnpm run test:alignment  # verify checklist ↔ test file mapping
pnpm run test:coverage   # generate HTML coverage report
```

CI runs all three automatically on every push and pull request.

---

## Section → Test File Map

| # | Section | Test File(s) | Items |
|---|---------|-------------|-------|
| 1 | Authentication | `auth.test.ts`, `api-auth.test.ts` | 18 |
| 2 | Tenant Management | `api-tenants.test.ts` | 15 |
| 3 | User Management | `api-users.test.ts` | 6 |
| 4 | Products | `api-products.test.ts` | 13 |
| 5 | Transactions & Orders | `api-transactions.test.ts`, `api-transactions-refunds.test.ts` | 13 |
| 6 | Payments & Invoices | `api-payments-invoices.test.ts`, `api-paypal.test.ts` | 8 |
| 7 | Customers | `api-customers.test.ts` | 6 |
| 8 | Inventory & Stock | `api-inventory.test.ts` | 6 |
| 9 | Discounts | `api-discounts.test.ts` | 7 |
| 10 | Tax Rules | `api-tax-rules.test.ts` | 6 |
| 11 | Bookings & Appointments | `api-bookings.test.ts` | 9 |
| 12 | Cash Drawer | `api-cash-drawer.test.ts` | 5 |
| 13 | Expenses | `api-expenses.test.ts` | 3 |
| 14 | Saved Carts | `api-saved-carts-loyalty.test.ts` | 2 |
| 15 | Loyalty Program | `api-saved-carts-loyalty.test.ts` | 6 |
| 16 | Attendance | `api-attendance-branches.test.ts` | 4 |
| 17 | Branches | `api-attendance-branches.test.ts` | 5 |
| 18 | Reports | `api-reports.test.ts` | 9 |
| 19 | Subscriptions | `api-subscriptions.test.ts` | 7 |
| 20 | Super Admin | `api-super-admin.test.ts` | 13 |
| 21 | Automations (Cron Jobs) | `api-automations.test.ts`, `automation-auth.test.ts` | 29 |
| 22 | Hardware Integration | `api-hardware-audit.test.ts` | 5 |
| 23 | Audit Logs | `api-hardware-audit.test.ts` | 4 |
| 24 | Multi-Currency | `api-multi-currency.test.ts` | 4 |
| 25 | Tenant Isolation (Security) | `api-tenant-isolation.test.ts` | 5 |
| 26 | Role-Based Access Control | `api-rbac.test.ts` | 7 |
| 27 | Rate Limiting | `api-rate-limit.test.ts`, `rate-limit.test.ts` | 4 |
| 28 | POS Interface (UI) | `ui-pos-dashboard.test.ts` | 8 |
| 29 | Admin Dashboard (UI) | `ui-pos-dashboard.test.ts` | 5 |
| 30 | Signup & Onboarding (UI) | `ui-pos-dashboard.test.ts` | 5 |
| 31 | Subscription & Billing (UI) | `ui-pos-dashboard.test.ts` | 5 |
| 32 | PWA / Offline | `api-pwa-utilities.test.ts` | 5 |
| 33 | Utility Endpoints | `api-pwa-utilities.test.ts` | 4 |
| — | Library utilities (no checklist section) | `logger.test.ts`, `validation.test.ts` | — |

---

## CI Workflow

Defined in `.github/workflows/ci.yml`. Triggered on every push to `main`/`develop` and all pull requests targeting `main`.

```
push / PR
    │
    ├─► lint          ESLint — zero errors required
    │
    ├─► test          vitest run   (all 33 files, 857 tests)
    │       │
    │       └─► coverage   HTML report uploaded as artifact
    │
    ├─► alignment     pnpm run test:alignment
    │                 Fails if any section is unmapped or checklist has [!] items
    │
    └─► build         next build   (runs after lint + test pass)
            │
            └─► security   npm audit --omit=dev --audit-level=high
```

### Jobs summary

| Job | When it runs | Fails if |
|-----|-------------|----------|
| `lint` | every push/PR | ESLint reports errors |
| `test` | every push/PR | any Vitest test fails |
| `alignment` | after `test` passes | a section has no test file, or any `[!]` in checklist |
| `build` | after `lint` + `test` | Next.js build error |
| `security` | every push/PR | `npm audit` finds high/critical vuln in prod deps |

---

## Adding a New Feature

When adding a new feature, keep the three files in sync:

1. **`TEST_CHECKLIST.md`** — add a new section `## N. Feature Name` with `[ ]` items
2. **`__tests__/api-feature.test.ts`** — write Vitest tests covering each item
3. **`scripts/check-alignment.ts`** — add `N: ['api-feature.test.ts']` to `SECTION_MAP`

Then verify:

```bash
pnpm run test            # all tests green
pnpm run test:alignment  # ✓ All sections covered
```

---

## Test Strategy by Layer

| Layer | What is tested | Environment |
|-------|---------------|-------------|
| API routes | Request → response (status, body, DB calls) | `vitest node` |
| Auth middleware | JWT validation, role checks, tenant isolation | `vitest node` |
| Business logic | Pure functions (currency, rate-limit, cart math) | `vitest node` |
| React components | Default export exists, props contract | `vitest node` (no DOM) |
| Service worker / PWA | File existence, cache constants, manifest shape | `vitest node` + `fs` |
| Integration (DB) | Mongoose queries mocked at model level | `vitest node` |

Full browser/E2E tests (Playwright/Cypress) are out of scope for this checklist but can be added as a separate workflow step.
