# Copilot Instructions for LocalPro POS

## Project Overview
- **LocalPro POS** is a multi-tenant, enterprise-grade Point of Sale system with both web and mobile clients.
- The codebase is organized by feature (products, transactions, inventory, etc.) and platform (web, mobile).
- Documentation is comprehensive and feature-based: see `docs/README.md`, `docs/INDEX.md`, and `README.md` for navigation.

## Architecture & Patterns
- **Web app**: Next.js (TypeScript), multi-tenant and multi-language routing under `app/[tenant]/[lang]/`.
- **API routes**: Located in `app/api/`, grouped by feature (e.g., `products/`, `transactions/`).
- **Components**: Shared React components in `components/`.
- **Business logic**: Feature-specific logic in `lib/` and `models/`.
- **Context**: Use React context for auth and tenant settings (`contexts/`).
- **Mobile API**: See `docs/mobile/` for structure and integration details.

## Developer Workflows
- **Install & Build**: Use `install.sh` (macOS/Linux) or `install.ps1` (Windows) for setup. These scripts clean, check prerequisites, configure env, install, and build.
- **Manual install**: `npm install` then `npm run build` (see `README_INSTALL.md`).
- **Run dev server**: `npm run dev` (Next.js server).
- **Testing**: Automated workflow scripts in `scripts/` (e.g., `test-automations.ts`).
- **Troubleshooting**: See `README_INSTALL.md` and `docs/` troubleshooting guides.

## Conventions & Best Practices
- **Feature-first**: Add new features in their own directory under `app/`, `lib/`, `models/`, and `docs/web/` or `docs/mobile/`.
- **Documentation**: Update relevant docs in `docs/` for every feature or API change. Use screenshot placeholders as needed.
- **API endpoints**: Follow RESTful patterns; see `README.md` (API Endpoints section) for examples.
- **Multi-tenancy**: Always scope data and routes by tenant and language where applicable.
- **Environment**: Use `.env.local` for secrets and config. See `README.md` for required variables.

## Integration & Cross-Component
- **Data flow**: API routes call business logic in `lib/` and `models/`, then return JSON to clients.
- **Mobile integration**: Follows API contract in `docs/mobile/reference/`.
- **Automations**: Automated workflows (reminders, alerts, etc.) are described in `README.md` and `AUTOMATION_QUICK_START.md`.

## Key References
- `README.md` — Project overview, API, and structure
- `README_INSTALL.md` — Setup and troubleshooting
- `docs/README.md` — Documentation hub
- `docs/web/`, `docs/mobile/` — Feature and platform docs
- `app/`, `components/`, `lib/`, `models/` — Main code

---
**When in doubt, search the `docs/` directory or the main `README.md` for feature-specific guidance.**
