# QA Analysis — Roles & Permissions

**Component under test:** `app/[tenant]/[lang]/admin/roles-permissions/page.tsx`
**Backing API:** `app/api/tenants/[slug]/role-permissions/route.ts` (`GET`, `PUT`)
**Permission gate:** `roles_permissions.manage` (floor: `admin`) via `usePermissions()` client-side, `hasTenantPermission()` server-side in both handlers — consistently the same key across sidebar, page, and both routes (verified, no mismatch of the kind found in the backup-reset audit)
**Existing test coverage (before this pass):** none
**Status:** initial audit completed 2026-09-21. Two findings fixed: missing rate limiting on both routes, and a "(custom)" marker bug where toggling a cell back to its default value left a redundant override entry instead of clearing it. Added `__tests__/roles-permissions-page.test.tsx` (10 tests, all passing). One item left open as a product/UX decision (§5).

---

## 1. Where it's wired in

| Layer | File | Role |
|---|---|---|
| Nav entry | [components/admin/AdminSidebar.tsx:164](components/admin/AdminSidebar.tsx#L164) | `permission: 'roles_permissions.manage'` — matches the page's own gate |
| Page | [app/[tenant]/[lang]/admin/roles-permissions/page.tsx](app/[tenant]/[lang]/admin/roles-permissions/page.tsx) | Client component: a matrix of every `PERMISSIONS` entry × `viewer`/`cashier`/`manager`, editable checkboxes with a "(custom)" marker + reset link for any cell that diverges from its default |
| Fetch | `GET /api/tenants/{tenant}/role-permissions` | Returns the tenant's stored `TenantRolePermissionOverride` row (or `{}` if none exists yet) |
| Save | `PUT /api/tenants/{tenant}/role-permissions` | Full-replace `upsert` of the overrides object, server-side sanitized to only known permission keys / overridable roles / boolean values |
| Consumers of the saved overrides | `lib/permissions.ts` (`hasPermission`, used client-side by every page's `usePermissions()`/`canAccess()`), `lib/permissions-server.ts` (`hasTenantPermission`, used server-side by essentially every permission-gated API route in the codebase) | This is the single control point for every viewer/cashier/manager-tier permission across the entire tenant app — the highest-leverage wiring point audited so far |

This page is structurally different from the other slices audited (settings, backup-reset, audit-logs): it isn't a feature with its own data, it's a **meta-control** that changes what every other feature's permission check evaluates to. A bug here doesn't just affect this page — it can silently change access for every other admin page in the tenant.

---

## 2. Functional walkthrough

- `sections`/`PERMISSIONS`/`OVERRIDABLE_ROLES`/`roleAtLeast` are all imported directly from `lib/permissions.ts` (the same isomorphic registry every other page's `usePermissions()` reads) — the table is guaranteed to always list every permission key that actually exists anywhere in the app, with no separate/stale list to drift out of sync (unlike backup-reset's now-fixed `BACKUP_RESET_COLLECTIONS`/`COLLECTION_MODELS` duplication risk).
- `isChecked` and the API's `hasTenantPermission`/`hasPermission` implement the exact same floor logic (`roleAtLeast(role, defaultMinRole)`, with an explicit boolean override taking precedence) — traced both client (`lib/permissions.ts:160-174`) and server (`lib/permissions-server.ts`) copies and confirmed they're the same function, not two independently-maintained implementations that could drift.
- **`admin`/`owner`/`super_admin` are correctly unreachable from this page**: `OVERRIDABLE_ROLES` is hardcoded to `['viewer', 'cashier', 'manager']`, and the server's `PUT` handler independently enforces the same restriction by only ever reading `overrides[role]` for `role of OVERRIDABLE_ROLES` — even a maliciously crafted request body containing an `admin`/`owner`/`super_admin` key is silently dropped, never reaching the database. No privilege-escalation path to the always-allowed roles.
- Traced the `hasTenantPermission(user.role, user.tenantId, ...)` calls in both `GET` and `PUT`, which use `user.tenantId` rather than the slug-resolved `tenant.id` — initially looked like a potential cross-tenant permission-check mismatch, but it's not exploitable: `isAlwaysAllowedRole` short-circuits `super_admin` to `true` before any tenantId is used, and every other role is already blocked from reaching that check for any tenant other than their own by the separate `user.tenantId !== tenant.id` ownership check elsewhere in each handler. No fix needed — documented here so a future reader doesn't have to re-derive it.
- **Because `roles_permissions.manage` itself is a `PERMISSIONS` entry** (`configuration` section, floor `admin`), it appears as a row in this very page's own table. An admin can explicitly grant a `manager` (or `cashier`/`viewer`) that permission via an override — which would let that role manage its own and other overridable roles' permissions going forward, including re-granting itself anything else in the table. This is consistent with the page's own description text ("Control which features viewer, cashier, and manager accounts can access") and isn't a bug, but the UI gives no extra warning when checking that specific box, unlike the outsized consequence of doing so. See finding #3.

---

## 3. Findings (bugs / risks), ranked

### High — fixed
1. ~~No rate limiting on either route.~~ **Fixed.** Per CLAUDE.md's mandatory route order (rate limit → auth → tenantId scoping → audit → error handler), neither `GET` nor `PUT` in `role-permissions/route.ts` had a `checkRateLimit` call — confirmed by grep, consistent with the same gap found and fixed on `reset-collections` and `audit-logs` in prior passes. Added 60/min (`GET`) and 20/min (`PUT`) per tenant slug — this endpoint gates every other permission check in the tenant, so even though it isn't itself destructive, abusive write traffic against it would be high-impact.

### Medium — fixed
2. ~~Toggling a cell back to its default value left a stale "(custom)" marker.~~ **Fixed.** `toggle()` unconditionally wrote `overrides[role][key] = !current` regardless of whether the new value happened to match the role's actual default — so unchecking a box that was checked by override, then re-checking it, left an explicit `override = true` stored even when `true` is also the default, and the cell kept showing "(custom)" with a live reset link for a cell that was, behaviorally, no longer customized. Fixed by comparing the new value against `roleAtLeast(role, defaultMinRole)` and deleting the override key entirely when they match, matching what `resetToDefault` already does. Regression-tested (`toggling a cell back to its default value clears the override instead of leaving a redundant one`).

### Low — open (product/UX decision)
3. **No extra warning when granting `roles_permissions.manage` itself to an overridable role.** Checking that one specific row for `manager`/`cashier`/`viewer` is categorically different from every other row in the table: it lets that role subsequently re-grant itself (or another overridable role) anything else in the matrix, including toggling that same permission for another role. The page's description banner already states the general intent ("Control which features..."), but doesn't call out that this one row is meta — it controls the controller. **Left open**: whether to add an inline warning/confirmation specifically for this row is a product/UX call, not a code bug — flagging per this skill's process (don't guess at product decisions).

---

## 4. Suggested test matrix

Items marked `[x]` are now automated in `__tests__/roles-permissions-page.test.tsx` (10 tests, all passing). Everything still `[ ]` is manual/integration-level or a follow-up not yet written.

### Permissions
- [x] `canManage=false`: access-restricted message shown, matrix not rendered.
- [x] `canManage=true`: matrix renders with the expected columns (`viewer`/`cashier`/`manager` only).
- [x] `admin`/`owner`/`super_admin` never appear as a column, matching `OVERRIDABLE_ROLES`.
- [ ] Cross-tenant: user authenticated for tenant A cannot read/write tenant B's overrides via a crafted slug (both handlers' `user.tenantId !== tenant.id` ownership check already enforces this server-side per the walkthrough above — needs an integration test against the real route, not a mocked component test).
- [ ] `super_admin` managing another tenant's overrides via the slug — the `isAlwaysAllowedRole` short-circuit in `hasTenantPermission` means the tenantId passed doesn't matter for this role, but that's a code-read conclusion, not yet verified with a live integration test.

### Default-floor rendering (`roleAtLeast` semantics)
- [x] A permission whose floor every overridable role meets (`dashboard.view`, floor `viewer`) renders checked for all three roles with no override.
- [x] A permission whose floor only `manager` meets (`reports.view`, floor `manager`) renders unchecked for `viewer`/`cashier`, checked for `manager` — confirms the floor comparison isn't an exact-match bug (`roleAtLeast`, not `role === defaultMinRole`).

### Toggling / override lifecycle
- [x] Toggling a cell shows the "(custom)" marker and enables Save.
- [x] Toggling a cell back to its default value clears the override and hides "(custom)" (finding #2's regression test).
- [x] Clicking the "(custom)" reset link clears the override directly.
- [ ] A permission with no defined default for a role that's later added to `PERMISSIONS` (i.e. schema drift) — not applicable today since every `PERMISSIONS` entry has a `defaultMinRole`, but worth a static assertion (`lib/permissions.ts` already types `defaultMinRole` as required, so TypeScript itself is the guard here — no runtime test needed).

### Save
- [x] Successful save calls `PUT` with the current `tenant` in the URL, shows a success message, and disables Save again (dirty flag reset).
- [x] A failed save shows the server's error message and leaves the form editable.
- [ ] Concurrent edits: Admin A's save fully overwrites the entire `overrides` object (`upsert`, not a merge) — if Admin B changed a different section concurrently, B's changes are silently lost by A's save (same class of gap already flagged as open in `docs/qa/admin-settings-qa-analysis.md`'s test matrix for that page's per-tab save scoping; this page has no per-section save at all, so the exposure is broader — needs a product call on whether to add version-checked or merge-based writes, not something to guess at in this pass).

### Data integrity
- [x] Loading an empty `overrides: {}` response renders every cell at its computed default with no cells marked "(custom)".
- [ ] Loading a persisted override for a permission key that no longer exists in `PERMISSIONS` (e.g. a since-removed feature) doesn't crash the page — server-side sanitization on `PUT` already prevents *writing* unknown keys, but an already-persisted stale key from before a permission was removed would need to be handled gracefully on read; not exercised by this test suite (needs a fixture with a synthetic stale key).

### Regression triggers (tie to CLAUDE.md's known incident class)
- [x] Tenant isolation confirmed by direct code read of both handlers (`tenantId: tenant.id` scoping the DB lookup/upsert) — not grep-only.
- [x] Rate limiting present on both `GET` and `PUT` (this audit's fix).
- [x] Role/permission floor semantics use `roleAtLeast`, not exact-match, confirmed by the default-floor rendering tests above.
- [x] No `.then` attached to any mock object in the new test file.

---

## 5. Recommended next steps

1. ~~Add rate limiting to both routes~~ — done, see finding #1.
2. ~~Fix the stale "(custom)" marker on toggle-back-to-default~~ — done, see finding #2, regression-tested.
3. **Decide whether granting `roles_permissions.manage` to an overridable role needs an extra confirmation (finding #3)** — flagging for a product call rather than guessing at the right UX, consistent with how the backup-reset audit left its irreversible-action confirmation question open rather than assuming an answer.
4. ~~Add component tests~~ — done: `__tests__/roles-permissions-page.test.tsx`, 10 tests, all passing. Follow-up: the `[ ]` items in §4, particularly the concurrent-write and cross-tenant cases, need a real integration test against a test database rather than a mocked-fetch component test.
5. **Consider a merge-based or version-checked save** instead of the current full-replace `upsert`, given this page has no per-section save scoping at all (unlike the admin-settings page, which at least scopes saves per tab) — every save here touches every role/permission cell at once. Flagging as a possible follow-up, not fixing speculatively since the current single-page-single-save design may be an intentional simplicity tradeoff for a page most tenants touch rarely.
