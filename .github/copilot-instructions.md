# Copilot & AI Agent Instructions for LocalPro POS

## Project Overview
- **LocalPro POS** is a multi-tenant, enterprise-grade Point of Sale system built with Next.js 16 (App Router), MongoDB (Mongoose), and Tailwind CSS.
- Supports real-time inventory, advanced reporting, multi-branch, and extensive customization.
- All features are accessible via both web and mobile APIs; see `docs/` for full documentation.

## Architecture & Patterns
- **App Structure:**
  - `app/[tenant]/[lang]/...` — Multi-tenant, multi-language routing. Each tenant and language has isolated admin, POS, inventory, and settings routes.
  - `app/api/` — REST API endpoints, grouped by feature (auth, products, transactions, etc). All endpoints require a `tenant` parameter for isolation.
  - `components/` — Reusable React components (POS UI, barcode/QR, hardware, analytics, etc).
  - `contexts/` — React Context for auth and tenant settings.
  - `lib/` — Utility modules for business logic (auth, stock, currency, hardware, etc).
  - `models/` — Mongoose models for all business entities (Product, Transaction, User, etc).
  - `scripts/` — Setup scripts for admin/tenant creation.

- **Multi-Tenancy:**
  - Data isolation is enforced at both API and UI levels. All API calls must include a `tenant` identifier.
  - Tenant-specific settings (branding, currency, language) are loaded via context and API.

- **RBAC:**
  - Role-based access (Owner, Admin, Manager, Cashier, Viewer) is enforced in both UI and API.
  - Use `contexts/AuthContext.tsx` and `lib/auth.ts` for auth logic.

- **Internationalization:**
  - All UI and API support English and Spanish. Language is set per tenant and route.
  - Use `validation-translations.ts` and context for i18n.

## Developer Workflows
- **Setup:**
  - Install dependencies: `npm install`
  - Configure `.env.local` (see `README.md` for required vars)
  - Create default tenant: `npm run tenant:default` or `npx tsx scripts/create-default-tenant.ts`
  - Create admin user: `npx tsx scripts/create-admin-user.ts default admin@example.com ...`
  - Start dev server: `npm run dev`

- **Build/Production:**
  - Build: `npm run build`
  - Start: `npm start`
  - See `PRODUCTION_README.md` for deployment details.

- **Testing:**
  - (Add test instructions here if/when tests are present)

## Project Conventions
- **API:** Always pass `tenant` as a query param. Use RESTful patterns for all endpoints.
- **Components:** Prefer colocating feature-specific components in `components/`. Use context for cross-cutting concerns.
- **Models:** All data access via Mongoose models in `models/`.
- **Error Handling:** Use centralized error handling in `lib/error-handler.ts`.
- **Stock/Inventory:** Real-time updates via SSE (`/api/inventory/realtime`).
- **Hardware:** Integrate via `lib/hardware/` and related components.

## Key References
- `README.md` — Full feature list, setup, and API summary
- `docs/` — Complete documentation for web, mobile, and all features
- `PRODUCTION_README.md` — Production deployment
- `MULTI_TENANT.md` — Multi-tenant architecture details
- `INVENTORY_MANAGEMENT.md` — Inventory logic
- `TENANT_SETTINGS.md` — Tenant settings/branding

---
For new features, follow existing patterns for routing, API, and data access. When in doubt, check the relevant `docs/` or ask for clarification.
