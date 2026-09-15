# 1pos

**1pos — multi-tenant point-of-sale, built to run every store from one platform.**

## Overview

1pos is a full-featured, multi-tenant SaaS Point-of-Sale (POS) system built for businesses that need to run one or many independent stores from a single platform. Each tenant operates in complete isolation — its own users, data, roles, and settings — while sharing one codebase and infrastructure. A separate super-admin layer sits entirely outside tenant scope, giving platform operators centralized control over provisioning, billing, and tenant health without ever touching tenant data directly.

The system is designed around two core audiences: **store staff**, who use the POS interface to process sales, manage inventory, and handle transactions day to day; and **store administrators**, who configure settings, manage roles, and review reports through a dedicated admin dashboard. A third audience — **platform super-admins** — manages the SaaS itself: onboarding new tenants, monitoring usage, and enforcing subscription plans.

## Architecture

1pos follows a strict URL-based tenancy model:

- `/{tenant}/{lang}/pos/*` — the point-of-sale interface for a given store
- `/{tenant}/{lang}/admin/*` — the tenant's admin dashboard
- `/super-admin/*` (or `admin.yourdomain.com/*` via subdomain routing) — platform-level management, completely outside any tenant's scope

This separation is enforced at the middleware and API layer, not just in the UI. Every tenant-scoped API route resolves the tenant from the authenticated user's JWT — never from client-supplied input — which closes off an entire class of cross-tenant data leakage bugs.

## Authentication & Authorization

Access control is built on a hierarchical role system rather than flat permissions:

```
viewer < cashier < manager < admin < owner < super_admin
```

Each role automatically satisfies checks for every role beneath it, so a route that requires `manager` also silently passes `admin`, `owner`, and `super_admin`. Authentication uses JWTs delivered via httpOnly, secure cookies, with signature verification, revocation-list checks, and a live database lookup to confirm the user is still active — so a deactivated user's token stops working immediately, not just at next expiry.

Super-admin accounts are a special case: they carry no `tenantId`, bypass the tenant-match check entirely, and pass every role gate by virtue of sitting at the top of the hierarchy. This lets one identity manage the entire platform without being scoped to any single store.

## Tenant Isolation

Tenant isolation is treated as a hard security boundary, not a convenience feature. Every database query in tenant-scoped code is filtered by the tenant ID pulled from the verified JWT, and dedicated helpers (`requireTenantAccess`, `getTenantIdFromRequest`) throw explicit violation errors if a request ever attempts to reach across tenant boundaries. This was reinforced by a full API audit that found and closed a cross-tenant data leak in the subscriptions endpoints — isolation isn't assumed, it's actively verified.

## Core Capabilities

- **Point of Sale**: transaction processing, barcode/QR scanning and generation, receipt handling
- **Inventory & Business Operations**: per-tenant business-type configuration, currency handling
- **Reporting**: chart-based analytics and Excel/PDF export of reports and documents
- **Notifications**: web push, plus optional email (SendGrid, Resend, or Nodemailer) and SMS (Twilio)
- **Payments**: integrated PayPal checkout via the official server SDK
- **Cash Management**: configurable auto-open cash drawer behavior at shift start and end
- **Localization**: language-aware routing baked directly into the URL structure
- **Platform Administration**: tenant provisioning, subscription plan assignment, and platform-wide stats for super-admins

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS 4 |
| Data layer | MongoDB via Mongoose 8 |
| Auth | JWT (`jsonwebtoken`), `bcryptjs` |
| Scheduling | node-cron |
| Payments | PayPal Server SDK |
| Storage | AWS S3 (optional AWS SNS) |
| Communications | SendGrid / Resend / Nodemailer (optional), Twilio (optional), Web Push |
| Documents & Codes | ExcelJS, jsPDF, jsbarcode, jsQR |
| Visualization | Recharts |
| Tooling | pnpm, Vitest + Testing Library, ESLint 9, tsx, k6 |

## Design Philosophy

The admin surface follows a deliberate Win8/Metro-inspired flat design language — solid tiles, no rounded corners, no drop shadows — kept consistent across every admin page. Security and correctness take precedence over convenience shortcuts: tenant IDs are never trusted from the client, roles are checked hierarchically rather than by exact match, and every mutating action is expected to pass through rate limiting, authentication, tenant scoping, and audit logging before touching the database.

## Who It's For

1pos is built for SaaS operators who want to sell POS software to multiple independent retail or service businesses from one deployment — rather than standing up a separate instance per customer — while still giving each business the feel of having its own dedicated system.
