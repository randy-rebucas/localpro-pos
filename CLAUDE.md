# localpro-pos — Claude Guide

## Project
Multi-tenant SaaS POS. Next.js 16 App Router + React 19 + TypeScript + MongoDB/Mongoose + Tailwind CSS.
URL pattern: `/{tenant}/{lang}/admin/*` and `/{tenant}/{lang}/pos/*`.

## Essential Commands
```bash
pnpm run dev            # Start dev server (port 3000)
pnpm run build          # Production build — must pass before merging
pnpm run lint           # ESLint (flat config, eslint.config.mjs)
pnpm run test           # Vitest unit tests (node env, __tests__/)
pnpm run test:coverage  # Tests + coverage report
pnpm run health:check   # Verify DB, collections, tenants, plans
pnpm run security:audit # npm audit (prod deps only, then all)
```

## Architecture Rules
- **Tenant isolation is mandatory.** Every API route MUST filter by `tenantId` from the verified JWT. Never trust client-supplied tenantId.
- **Auth pattern**: call `getCurrentUser(request)` from `lib/auth.ts`. It reads `auth-token` cookie or `Authorization: Bearer` header.
- **DB pattern**: always `await connectDB()` before any Mongoose query. Never import models without the connection guard.
- **Error handling**: use `handleApiError(error, message)` from `lib/error-handler.ts` for all API route catch blocks.
- **Audit trail**: call `createAuditLog(request, data)` from `lib/audit.ts` on all mutating operations (create, update, delete).
- **Rate limiting**: apply `checkRateLimit(key, limit, windowMs)` from `lib/rate-limit.ts` on auth and write endpoints.
- **Super-admin role**: `role === 'super_admin'` bypasses tenant scope. Do not apply tenantId filter for super_admin-only routes.

## Code Style
- TypeScript strict. Avoid `any` — use `unknown` then narrow.
- API responses: `{ success: true, data: ... }` or `{ success: false, error: string }`.
- i18n: all user-facing strings go through the dictionaries system (`app/[tenant]/[lang]/dictionaries.ts`).
- Component convention: `'use client'` only when needed. Prefer server components.
- Tailwind only — no CSS modules, no inline styles.

## Environment Variables
Required locally: `MONGODB_URI` (`.env.local`).
Required in production: `MONGODB_URI`, `JWT_SECRET`, `ALLOWED_ORIGINS`.

## Verify Your Work
After any change, run in order:
1. `pnpm run lint`         — zero errors
2. `pnpm run test`         — all tests pass
3. `pnpm run build`        — for API/server component changes
4. `pnpm run health:check` — for any DB schema or model change
