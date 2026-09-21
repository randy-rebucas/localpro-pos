# QA Analysis — Holiday Calendar (tenant admin)

**Component under test:** `app/[tenant]/[lang]/admin/holidays/page.tsx` + `components/settings/HolidaysManager.tsx`
**Backing API:** `app/api/tenants/[slug]/holidays/route.ts` (`GET`, `POST`, `PUT`, `DELETE`)
**Permission gate:** server-side only — `roleAtLeast(user.role, 'manager')` on write verbs (`POST`/`PUT`/`DELETE`); `GET` only requires any authenticated same-tenant user. Not registered as a permission key in `lib/permissions.ts`, so (unlike `settings.manage`/`business_hours.manage`) it cannot be adjusted per-tenant via the Roles & Permissions override UI, and there is no client-side gate at all — see §3 Medium.
**Existing test coverage:** none before this pass — added `__tests__/holidays-page.test.tsx` (9 tests)
**Status:** Audited 2026-09-21. Fixed three same-day bugs, all plain code fixes (not product decisions): (1) non-unique holiday IDs (`Date.now()`-based on a global `@id` column) that could collide across concurrent requests from *any* tenant; (2) the admin page permanently hanging on its loading spinner if an unrelated, unused settings fetch failed; (3) the holiday list silently rendering "no holidays" instead of an error when the GET itself failed. One Medium item (no client-side permission gating, unlike sibling admin pages) is left open — fixing it requires registering a new permission key, which is a product/scope decision, not a bug fix.

---

## 1. Where it's wired in

| Layer | File | Role |
|---|---|---|
| Page | `app/[tenant]/[lang]/admin/holidays/page.tsx` | Thin shell: loads the dictionary, renders `HolidaysManager` |
| Fetch/CRUD | `components/settings/HolidaysManager.tsx` | Owns its own `fetchHolidays`/`handleSave`/`handleDelete` against `/api/tenants/{tenant}/holidays` — entirely self-contained, does **not** go through the page's props for data |
| API | `app/api/tenants/[slug]/holidays/route.ts` | `GET`/`POST`/`PUT`/`DELETE`, tenant-scoped, `roleAtLeast(role, 'manager')` on writes |
| Consumers of saved data | `lib/holidays.ts` (not modified this pass — used by booking/availability logic per the page's own subtitle: "affect booking availability") | Out of scope for this slice; not audited here |

## 2. Functional walkthrough

Before this pass, `HolidaysAdminPage` (`page.tsx`) called a second hook, `useHolidaysSettings(tenant)`, which fetched the tenant's *entire settings row* from `/api/tenants/{tenant}/settings` purely to gate rendering (`if (!dict || loading || !settings) return <spinner>`) and to pass `settings`/`onUpdate` props into `HolidaysManager`. `HolidaysManager` never read `settings` or called `onUpdate` anywhere in its body (confirmed by grep — both props were dead, and the component's own signature had an `eslint-disable-line no-unused-vars` marking exactly that). Meanwhile `HolidaysManager` fetches its actual data itself, from a completely different endpoint (`/api/tenants/{tenant}/holidays`), scoped to the `TenantHoliday` table, not `TenantSettings`.

Net effect of the old wiring: the page's ability to render *anything* — including the fully-functional, independently-fetching `HolidaysManager` — depended on a fetch whose result it never used, and that fetch's own hook (`useHolidaysSettings.fetchSettings`) had no error path beyond `console.error` (no `setMessage`, no retry). So a transient failure of the unrelated settings endpoint (network blip, 500, non-2xx) left the page permanently on the loading spinner, with the real holiday CRUD never getting a chance to render, and nothing in the UI telling the admin why. **Fixed** by removing the page's dependency on `useHolidaysSettings` entirely and deleting the now-fully-unused hook (`hooks/useHolidaysSettings.ts`) and the unused `settings`/`onUpdate` props from `HolidaysManagerProps`.

Separately, `HolidaysManager.fetchHolidays` (`HolidaysManager.tsx:35-50`, pre-fix) only handled `data.success === true`; a `{success: false, error}` response from `GET /api/tenants/{tenant}/holidays` fell through both branches, leaving `holidays` at its initial `[]` and rendering the "No holidays configured" empty state — indistinguishable from a tenant that genuinely has none. **Fixed** by adding the missing `else` branch to surface `data.error` via the same `setMessage` path the `POST`/`PUT`/`DELETE` handlers already use.

On the write side, `POST` (`route.ts`, pre-fix) generated `id = \`holiday_${Date.now()}\`` for a `TenantHoliday.id` field that is `@id` with no other scoping (`prisma/schema.prisma:793` — confirmed no `@@unique([tenantId, id])` or similar; it's a bare global primary key). Two `POST`s landing in the same millisecond — from the same tenant (e.g. a double-click before the Save button disables, which it never does — no `disabled`/in-flight guard on that button) or from *two different tenants* under concurrent load — collide on the primary key; Prisma throws a unique-constraint error, caught and returned as a generic 500 "Failed to save holiday: Database error" to whichever request loses the race. **Fixed** by switching to `randomUUID()`, matching the pattern already used elsewhere in the codebase (e.g. `app/api/super-admin/feature-flags/[tenantSlug]/route.ts`).

While fixing the loading-hang bug, also found that every `<label>` in `HolidayForm` except the `isBusinessClosed` checkbox lacked a `htmlFor`/`id` pairing — not just a style nit, this fails "custom controls expose accessible labels" for screen readers/assistive tech (a sighted user only navigates by visual proximity, but nothing programmatically ties "Date *" to the date `<input>`). **Fixed** by adding matching `id`/`htmlFor` pairs to all six label/control pairs (`holidayName`, `holidayType`, `holidayDate`, `recurringPattern`, `recurringMonth`, `recurringDayOfMonth` — shared between the yearly and monthly branches, which are mutually exclusive in the DOM — and `recurringDayOfWeek`).

## 3. Findings (bugs / risks), ranked

### Critical
None found after fixes. (The ID-collision bug below was assessed as High, not Critical, since it degrades availability for a losing request rather than corrupting data — the loser gets a clean 500 and can retry.)

### High

1. **Holiday ID collisions across concurrent requests, tenant-agnostic.** `route.ts` POST used `holiday_${Date.now()}` against a bare global `@id` column. **Fixed** — now `holiday_${randomUUID()}`.
2. **Page could hang on the loading spinner forever on an unrelated fetch failure.** See §2. **Fixed** — the page no longer depends on `useHolidaysSettings`; `hooks/useHolidaysSettings.ts` deleted as dead code.

### Medium

3. **GET failure silently rendered as "no holidays."** See §2. **Fixed** — `fetchHolidays` now surfaces `data.error` via `setMessage` on a `{success: false}` response, matching the existing error-handling pattern used by save/delete.
4. **No client-side permission gating on Add/Edit/Delete.** Every other audited admin page in this pattern (`feature-flags`, `roles-permissions`) disables/hides write controls for a role below the permission floor, via `usePermissions().canAccess(...)`. This page shows the full Add/Edit/Delete UI to every authenticated tenant user regardless of role; a `viewer`/`cashier` can fill out and submit the form, only to get a 403 back from the server (`roleAtLeast(user.role, 'manager')`). Not a security hole — the server independently enforces the floor — but it's a worse UX than the sibling pages and inconsistent with house style. **Open**: fixing it properly means registering a permission key (e.g. `holidays.manage`) in `lib/permissions.ts` and switching the route from a raw `roleAtLeast` check to `hasTenantPermission`, which also makes it tenant-overridable like `settings.manage`/`business_hours.manage` — that's a scope/product decision (does this need to be overridable per-tenant, or is a hardcoded `manager` floor intentional?), not a plain bug fix, so left open.
5. **No numeric bounds validation server-side for recurring day/month fields.** The client `<input type="number" min="1" max="31">` is only a soft UI hint; `POST`/`PUT` never validate that `recurring.dayOfMonth` is 1–31 or `recurring.month` is 1–12 before persisting (only presence is checked — `route.ts:108-116`). A crafted request (bypassing the client) can persist `dayOfMonth: 99` or `month: -5`, which then feeds `resolvedDate` (`route.ts:129-133`) as a malformed date string. **Open** — a validation-parity gap worth closing, but not fixed this pass (out of the two "plain, obviously-safe" fixes budget already spent; recommend as next step).

### Low

6. **`GET /api/tenants/[slug]/holidays` has no rate limit**, unlike `POST`/`PUT`/`DELETE` on the same route (`route.ts` — compare `checkRateLimit('holidays:...')` present on writes, absent on read). Low risk (read-only, tenant/auth-scoped), but inconsistent within the same file.
7. **Save button has no in-flight/disabled state** during `handleSave`/`handleDelete` (`HolidaysManager.tsx`), so a fast double-click can fire two identical requests. The ID-collision fix (finding #1) removes the worst consequence (a 500), but a duplicate holiday can still be created. Not fixed — minor UX polish, not a correctness bug now that IDs are unique.

## 4. Suggested test matrix

**Permissions**
- [ ] Role below `manager` floor: server independently rejects `POST`/`PUT`/`DELETE` with 403 (`roleAtLeast` check in `route.ts`) — not exercised by the new mocked-fetch component suite; would need an integration test against a real DB/auth token, since there's no client-side gate to assert against yet (see Medium #4).
- [ ] Role at/above `manager`: writes succeed — implicitly covered by the create/edit/delete tests (mocked fetch always returns success), but doesn't prove the server accepts a real `manager` token.
- [ ] Cross-tenant: a user authenticated for tenant A cannot read/write tenant B's holidays. Server-side scoping (`tenantId: tenant.id` on every query, plus the explicit `user.tenantId !== tenant.id` check) inspected and looks correct on all four verbs, but needs a real integration test to prove — not provable from a mocked-fetch component test.

**Data integrity**
- [x] Client list shape (`Holiday` interface in `HolidaysManager.tsx`) matches `toResponseShape()`'s output field-by-field — re-derived this pass, no mismatch found (unlike the historical `address` nesting bug referenced in the QA checklist).
- [x] GET failure surfaces an error instead of silently showing the empty state (regression test added, documents the fix).
- [x] Page renders/functions correctly with no dependency on the unrelated settings endpoint (regression test explicitly asserts `/settings` is never called).
- [ ] Concurrent-create ID collision — the `randomUUID()` fix is a code-level fix verifiable by inspection; not practical to regression-test the old `Date.now()` collision in a unit suite (would need real concurrent requests against a real DB).
- [ ] Server-side numeric bounds on `recurring.month`/`recurring.dayOfMonth` (Medium #5) — no test added since the validation itself doesn't exist yet.

**Save / error handling**
- [x] Single-date create round-trips through `POST` with the correct body shape and refetches the list.
- [x] Recurring (yearly) create sends `date: ''` and the `recurring` object instead.
- [x] Server-side validation error (e.g. missing date) surfaces the server's message.
- [x] Edit round-trips through `PUT` with the holiday's `id`.
- [x] Delete round-trips through `DELETE` after `window.confirm`, and is skipped entirely when confirmation is dismissed.

**Accessibility**
- [x] Every form label is now programmatically associated with its control via `htmlFor`/`id` (fixed this pass — previously only the `isBusinessClosed` checkbox had this; the fix was validated by switching the new tests to `getByLabelText`/`getByLabelText`-style queries, which only pass with a real label association).
- [ ] Keyboard-only flow through the full Add/Edit form — not exercised; risk is low given plain native form controls throughout.

**i18n**
- [x] All new/edited strings (including the newly-added GET-failure error message) go through `dict?.holidays?.*` with an English literal fallback, matching the existing pattern in the file.
- [ ] Spot-check `es` locale has matching `holidays.*` keys — not done this pass.

**Regression triggers**
- [x] No `.then` attached to a mock object anywhere in `holidays-page.test.tsx`.
- [x] Tenant isolation re-checked for all four verbs on this route — `tenantId` scoping present throughout, no cross-tenant leak found.
- [x] Permission check on writes uses floor semantics (`roleAtLeast`), not exact-match.
- [N/A] Win8/Metro styling — this page lives under `app/[tenant]/[lang]/admin/**`, not `app/super-admin/**`.

## 5. Recommended next steps

1. Decide whether holiday management should get its own overridable permission key (`holidays.manage` via `hasTenantPermission`, wired into a client-side `canAccess` gate matching `feature-flags`/`roles-permissions`) or whether the hardcoded `manager` floor is intentional (Medium #4).
2. Add server-side range validation for `recurring.month` (1–12) and `recurring.dayOfMonth` (1–31) on `POST`/`PUT` (Medium #5) — mirrors the bounds the client already advertises via `min`/`max` but never enforces server-side.
3. Add rate limiting to the `GET` handler for consistency with the other three verbs on the same route (Low #6).
4. Consider disabling the Save/Delete buttons while their request is in flight to prevent duplicate submissions (Low #7) — lower priority now that IDs can no longer collide.
5. Add a real-DB integration test proving cross-tenant isolation on all four verbs, and proving the `manager`-floor rejection for a sub-manager role — both currently only verified by code inspection.
~~6. Add component test coverage for the holidays page (none existed before this audit).~~
~~7. Fix the three same-day bugs found: ID collisions, spinner hang on an unused fetch, and silent GET-failure swallowing.~~
~~8. Fix missing label/input associations across the holiday form.~~
