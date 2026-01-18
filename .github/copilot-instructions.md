# Copilot AI Agent Instructions for 1POS Codebase

## Project Overview
- **1POS** is a multi-tenant, enterprise-grade POS system built with Next.js 16 (App Router), MongoDB (Mongoose), and Tailwind CSS.
- Supports retail, restaurant, laundry, service, and general business types with a universal POS schema and industry-specific extensions.
- Real-time inventory, advanced reporting, automated workflows, and hardware integration (barcode/QR scanners, receipt printers).

## Architecture & Key Patterns
- **App Structure:**
  - `app/[tenant]/[lang]/` — Multi-tenant, multi-language routes (POS, admin, inventory, products, reports, settings, etc.)
  - `app/api/` — REST API endpoints for all features (auth, products, inventory, transactions, etc.)
  - `components/` — Reusable React components (POS UI, hardware, alerts, charts)
  - `contexts/` — React contexts for auth, tenant settings, etc.
  - `lib/` — Utility libraries (auth, currency, stock, hardware, etc.)
  - `models/` — Mongoose models for all business objects
  - `scripts/` — Setup scripts (admin user, default tenant)
- **Multi-Tenancy:**
  - Data isolation per tenant; routing via path (`/tenant/lang/...`), subdomain, or custom domain.
  - Tenant-specific settings, branding, currency, and localization.
- **RBAC:**
  - Role-based access (Owner, Admin, Manager, Cashier, Viewer) enforced in API and UI.
- **Automations:**
  - 7+ built-in workflows (booking reminders, low stock alerts, auto clock-out, etc.)
- **Offline Support:**
  - Local storage for offline transactions, auto-sync when online, offline indicator.

## Developer Workflows
- **Install:**
  - `./install.sh` (macOS/Linux) or `./install.ps1` (Windows) — cleans, checks prerequisites, installs, builds, sets up env.
- **Manual Setup:**
  - `npm install` / `pnpm install` / `yarn install`
  - Create `.env.local` (see README for required vars)
  - `npm run tenant:default` — create default tenant
  - `npx tsx scripts/create-admin-user.ts default admin@example.com ...` — create admin user
- **Run:**
  - `npm run dev` (dev server)
  - `npm run build` + `npm start` (production)
- **Testing:**
  - (Add test details here if/when present)

## Project Conventions
- **API:** All endpoints require `tenant` param for isolation. Use `/api/[feature]?tenant=xxx`.
- **Models:** All business logic in `models/` and `lib/` — always check for tenant isolation and RBAC.
- **Components:** Use context providers from `contexts/` for auth, tenant, and settings.
- **Internationalization:** English and Spanish supported; use tenant-specific language settings.
- **Feature Flags:** Enable/disable features per tenant in settings.
- **Receipts:** Customizable per tenant (branding, header/footer, tax labels).

## Integration Points
- **Hardware:** Barcode/QR scanners, receipt printers — see `components/Hardware*` and `lib/hardware/`.
- **Mobile:** See `MOBILE_API_INTEGRATION.md` and `docs/mobile/` for mobile API details.
- **Automations:** See `AUTOMATION_QUICK_START.md` for workflow setup.

## Key References
- [README.md](../README.md) — Full system overview, setup, and API docs
- [FEATURES.md](../FEATURES.md) — Complete feature list
- [MULTI_TENANT.md](../MULTI_TENANT.md) — Multi-tenant architecture
- [INVENTORY_MANAGEMENT.md](../INVENTORY_MANAGEMENT.md) — Inventory features
- [BOOKING_SCHEDULING.md](../BOOKING_SCHEDULING.md) — Booking system
- [MOBILE_API_INTEGRATION.md](../MOBILE_API_INTEGRATION.md) — Mobile API

## Examples
- To add a new POS feature: create API in `app/api/`, UI in `app/[tenant]/[lang]/`, model in `models/`, and utility in `lib/`.
- To add a new tenant setting: update `TenantSettingsContext`, `models/Tenant.ts`, and relevant UI in `app/[tenant]/[lang]/settings/`.

---
**For more, see the documentation index in `docs/INDEX.md`.**
