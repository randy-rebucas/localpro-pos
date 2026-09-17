# workflow-integrity

Audit or implement any feature slice — API route(s), the page(s)/component(s) that call them, and any setting/toggle that controls them — so it can't leave a half-done state, a double-applied write, or a control (permission gate, feature flag, setting) that's declared but not actually wired to what it's supposed to govern. Covers two overlapping concerns:

- **Multi-step workflow integrity** (transactions, checkout, refund, void, shift open/close, stock adjustment, payment capture, loyalty/balance adjustment) — any handler writing to **more than one collection or side effect**.
- **Wiring integrity** — any UI gate, permission check, setting, or feature flag that exists in one layer (page, component, settings screen) must actually be enforced/consumed in every other layer it claims to affect (API route, cron job, other pages/components reading the same setting).

Single-collection CRUD with no cross-layer control to verify only needs [[api_patterns]] (`add-api-route`).

## Process
Run every invocation as five explicit phases — don't collapse straight to editing code:

1. **Analyze** — read the target page/feature/module fully (not grep-only) and map what it touches: which API route(s) it calls, which models it writes, which settings/permission keys/feature flags gate it, and which other pages/components/cron jobs read the same route, model, or setting. This is the input to the **Checks** section below.
2. **List tasks** — from the analysis, enumerate every concrete gap found against the Checks (A. multi-write workflow, B. wiring integrity) as a discrete task list before touching code. Each task should name the exact file(s)/line(s) and which check it fails.
3. **Execute** — fix each listed task. Don't fix issues discovered mid-edit without adding them to the task list first (keeps the list authoritative for step 4/5 review).
4. **Test** — run `pnpm lint` and `pnpm build` (see Verify); run/add a targeted Vitest test for any race/idempotency/wiring fix; if a UI gate or setting changed, manually trace the consumer(s) identified in step 1 to confirm they now branch correctly. Don't report done on type-check alone if the fix was behavioral (race condition, double-write, dead control).
5. **Suggest next steps** — after the fix, call out anything adjacent found during analysis but out of scope for this task: other consumers of the same setting/permission that weren't touched, other routes in the same feature folder missing the same pattern (transaction/idempotency/audit), or follow-up hardening. Don't silently fix out-of-scope items — list them for the user to prioritize.

## When
- Editing `app/api/{transactions,pos,cash-drawer,stock-movements,inventory,payments,loyalty}` or any route doing 2+ model writes.
- Adding/editing a **settings, feature-flag, roles-permissions, or toggle** page/route (anything under `app/[tenant]/[lang]/admin/settings`, `feature-flags`, `roles-permissions`, or an API route that reads/writes `tenant.settings.*`).
- Adding/editing any admin page, component, or route that gates behavior behind a permission, role, or setting.
- User reports stock/balance/shift discrepancy, double charge/refund, or "I turned X off/on but nothing changed."

## Checks

### A. Multi-write workflow (when the route has 2+ side effects)
1. **Atomicity** — all writes succeed or none do. Prefer a Mongo transaction (`startSession()` + `withTransaction()`, `{ session }` on every write). Prior art: only `prescriptions/[id]/dispense`, `loyalty/adjust`, `customers/[id]/balance-payments` use transactions (`rg "withTransaction|startSession" app/api`) — new multi-write financial/inventory routes should match that, not the untransacted majority. No transaction + no compensating rollback on a multi-write financial/inventory route = flag it, even if "unlikely to fail."
2. **Idempotency** — can a retry/double-tap/back-button resubmit double-apply? Needs a dedupe key (client idempotency token or unique index) turning a repeat into a no-op/409. Payment capture/refund are highest risk.
3. **Concurrency** — flag `findOne` → compute → `save()` on stock/balance/points (two concurrent sales can oversell). Prefer atomic `findOneAndUpdate` with `$inc` + a precondition filter (e.g. `{ stock: { $gte: qty } }`).
4. **State machine** — status transitions (pending→completed→refunded, open→closed, pending→dispensed) must be validated server-side before mutating, not just set.

### B. Wiring integrity (every layer that touches the control, always check)
5. **UI gate ↔ server enforcement parity** — if a page/component hides or disables something behind `canAccess(key)` / `roleAtLeast(...)` / a feature flag, every API route that performs that action must independently enforce the *same* check server-side (never trust the client-side gate as the only barrier). Conversely, if a route enforces a permission, confirm the UI actually reflects it (no dead controls shown to users who'll get a 403). For a page like `page.tsx:128` (`canManage` gate before `roles_permissions.manage`), grep every HTTP verb of the matching route file and confirm GET/POST/PUT/PATCH/DELETE each re-check the same key — not just the mutating ones.
6. **Setting → consumer wiring** — a setting saved on a settings page (e.g. `tenant.settings.rolePermissionOverrides`, `tenant.settings.businessHours`, a feature-flag doc) is worthless if nothing reads it. For any new/edited setting, `rg` the field name across `app/api` and `lib/` to find every place that should branch on it, and confirm: (a) at least one real consumer exists, (b) the consumer reads the *current* tenant's value (no hardcoded default silently overriding it), (c) if multiple features are supposed to respect the setting (e.g. a permission override affecting several routes/pages), all of them do — not just the first one built.
7. **Stale/orphaned controls** — flag a UI toggle, permission key, or `PERMISSIONS`/`PERMISSION_SECTIONS` entry (`lib/permissions.ts`) that has no route or component checking it (dead config the user believes does something), and the reverse: a route checking a permission key that no admin UI can actually grant/revoke.
8. **Tenant + audit** — every write shares `tenantId`; one audit log per meaningful state change, not just the first write. See [[project_tenant_isolation_audit]], [[auth_system]], [[project_role_permission_audit]].
9. **Language/translation** — any user-facing error/status message returned by the route (validation failures, state-transition rejections, success messages) must go through the translation layer (`getValidationTranslator` / `getValidationTranslatorFromTenant` / `getValidationTranslatorFromRequest` in `lib/validation-translations.ts`), not a hardcoded English string. Flag any new or edited route/page that returns or renders raw literal strings instead of `t(key, fallback)` / dict lookups.

## Output
This is the deliverable for Process steps 2–3 (task list + execution). Per feature slice, list every file touched (route(s), page(s), component(s), setting definition) and walk: writes involved (if multi-write) → atomicity → idempotency → concurrency → state machine → **UI↔server gate parity** → **setting↔consumer wiring** → orphaned controls → tenant/audit → language/translation. Flag only plausible concrete failure scenarios (same bar as [[project_tenant_isolation_audit]]/[[project_role_permission_audit]]: full file read of every layer involved, no grep-only pass, no hedging). When a check doesn't apply (e.g. single-layer CRUD with no setting), say so in one line instead of omitting it silently.

## Verify
Process step 4. `pnpm run lint` && `pnpm run build`; add a test via `test-writer` if a race/idempotency/wiring fix has no coverage.
