# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

"1POS" — an enterprise multi-tenant Point-of-Sale system. Next.js 16 (App Router) + React 19, MongoDB/Mongoose, Tailwind 4. Multi-tenant with path-based routing (`/tenant-slug/lang/...`) and subdomain/custom-domain support. Package manager is pnpm.

## Common commands

```bash
pnpm dev              # next dev --turbopack
pnpm build
pnpm start
pnpm lint             # eslint

pnpm test             # vitest run (all tests)
pnpm test:watch       # vitest watch mode
pnpm test:coverage    # vitest with v8 coverage
npx vitest run __tests__/path/to/file.test.ts   # run a single test file

pnpm tenant:create        # create a new tenant (scripts/*.ts via tsx)
pnpm db:backup
pnpm health:check
pnpm seed:sample-data
pnpm test:automations
```

k6 load/stress/security test scripts also exist under `load-tests/` — check `package.json` scripts for the exact invocations.

## Architecture

- **Routing**: Next.js App Router. Tenant-facing pages live under `app/[tenant]/[lang]/...`. API routes live under `app/api/**/route.ts`, grouped by feature (attendance, bookings, branches, customers, discounts, expenses, hardware, subscriptions, etc.).
- **Database**: MongoDB via Mongoose. `lib/mongodb.ts` provides the connection helper (`connectDB()`); ~35 schemas live in `models/` (`Tenant.ts`, `User.ts`, `Transaction.ts`, `Product.ts`, `Booking.ts`, `AuditLog.ts`, `BillingEvent.ts`, etc.).
- **Auth**: JWT-based. `lib/auth.ts` exports `requireAuth(request)` which verifies the token and returns the user payload (including `tenantId` and `role`); `lib/auth-customer.ts` handles customer-side auth separately. `lib/token-blacklist.ts` handles revocation.
- **Roles/permissions**: `lib/permissions.ts` defines a `ROLE_HIERARCHY` and `roleAtLeast(role, floor)` — role checks are a hierarchical floor, not an exact match (e.g. checking for `manager` also passes for `owner`). `lib/permissions-server.ts` has `hasTenantPermission(role, tenantId, permKey)` for tenant-scoped permission checks used inside routes.
- **Multi-tenancy**: There is no single centralized API-handler wrapper. Every API route composes the same boilerplate manually, in this order:
  1. Rate limiting (`lib/rate-limit.ts`)
  2. Auth (`requireAuth(request)` from `lib/auth.ts`)
  3. DB connect (`connectDB()` from `lib/mongodb.ts`)
  4. Scope every query with `tenantId: user.tenantId` (helpers in `lib/tenant.ts`, `lib/tenant-active-query.ts`)
  5. Audit logging (`lib/audit.ts` / `lib/audit-helpers.ts`)
  6. Centralized error handling (`lib/error-handler.ts`)

  When adding or modifying an API route, follow this exact sequence and never skip the `tenantId` scoping — cross-tenant data leaks have been a real issue here (subscriptions endpoints previously leaked cross-tenant). Look at an existing route in the same feature folder for the concrete pattern before writing a new one.
- **Super-admin panel**: separate area at `app/super-admin/` (dashboard, tenants, users, billing, subscriptions, plans, coupons, business-types, analytics, backups, logs, settings, login). This area uses a **Windows 8 / Metro-style flat design system** (`app/globals.css`, e.g. `.checkbox-win8`) — no rounded corners, solid tiles, flat colors. Any layout/styling change in `app/super-admin/` must match this system, not the tenant-facing app's styling.
- **Cron/automations**: `lib/cron.ts` uses `node-cron` to schedule jobs defined in `lib/automations/` (booking reminders, no-show detection, low stock alerts, scheduled sales reports, auto clock-out, cash drawer auto-close, dynamic pricing, backups, audit log cleanup). Can be deployed via Vercel Cron (`vercel.json`), self-hosted node-cron, or an external cron service.

## Folder structure

- `app/` — Next.js App Router: tenant pages (`[tenant]/[lang]/`), API routes (`api/`), super-admin panel (`super-admin/`)
- `lib/` — business logic and shared helpers (auth, tenant scoping, automations, cron, payments, permissions)
- `models/` — Mongoose schemas
- `components/` — shared React components
- `contexts/` — React context providers (auth/tenant)
- `hooks/` — custom React hooks
- `types/` — shared TypeScript types
- `__tests__/` — Vitest tests
- `scripts/` — CLI/maintenance scripts run via `tsx`
- `docs/` — feature documentation (including `docs/mobile/`)
- `load-tests/` — k6 scripts

## Testing

Vitest config (`vitest.config.ts`): jsdom environment, globals enabled, setup file `__tests__/setup.ts`, includes `__tests__/**/*.test.{ts,tsx}` and `components/**/*.test.tsx`, v8 coverage.

Important: never attach `.then` to mock objects in tests — use `mockResolvedValue` instead. Adding a `.then` to a plain mock object has caused vitest to treat it as a thenable and hang/OOM.

## Conventions from `.github/copilot-instructions.md`

- Use `install.sh` / `install.ps1` for environment setup.
- Always scope data and routes by tenant.
- Update `docs/` when a feature changes.
