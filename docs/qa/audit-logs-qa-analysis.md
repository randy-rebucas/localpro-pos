# QA Analysis — Audit Logs

**Component under test:** `app/[tenant]/[lang]/admin/audit-logs/page.tsx`
**Backing API:** `app/api/audit-logs/route.ts` (`GET`, list/filter/paginate), `app/api/audit-logs/export/route.ts` (`GET`, CSV/JSON export — the BIR "electronic journal" dump), `app/api/users/route.ts` (`GET`, populates the User filter dropdown)
**Permission gate:** `audit_logs.view` (floor: `manager`) to see the page, `audit_logs.export` (floor: `admin`) to see the export buttons — both via `usePermissions()` client-side and `hasTenantPermission()` server-side
**Existing test coverage (before this pass):** none
**Status:** initial audit completed 2026-09-21. One Critical display bug fixed (every audit log row showed "System" as the actor instead of the real user), plus a missing-rate-limit fix on the main list endpoint. Added `__tests__/audit-logs-page.test.tsx` (8 tests, all passing) — the first automated coverage this page has had. Two findings left open: a filter-vs-export mismatch and a permission-floor coupling to an unrelated endpoint, both flagged rather than guessed at (§5).

---

## 1. Where it's wired in

| Layer | File | Role |
|---|---|---|
| Nav entry | [components/admin/AdminSidebar.tsx:165](components/admin/AdminSidebar.tsx#L165) | `permission: 'audit_logs.view'` — matches the page's own gate |
| Page | [app/[tenant]/[lang]/admin/audit-logs/page.tsx](app/[tenant]/[lang]/admin/audit-logs/page.tsx) | Client component: filter sidebar (action/entity type/user/date range) + paginated table + CSV/JSON export |
| List fetch | `GET /api/audit-logs` (via `useAuditLogs`) | Tenant-scoped (`where: { tenantId: user.tenantId }`), paginated (max 200/page), filterable |
| User filter options | `GET /api/users` (via `useAuditUsers`) | **Gated on `users.manage`, not `audit_logs.view`** — see finding #3 |
| Export | `GET /api/audit-logs/export` | Tenant-scoped, rate-limited (10/min), writes its own audit log entry (`AuditActions.AUDIT_LOG_EXPORT`) for the export action itself |
| Auto-purge | `app/api/automations/audit-logs/cleanup` | Rows older than 90 days are purged on a schedule — export/archive periodically if longer retention is needed (documented in the export route's own comment) |

---

## 2. Functional walkthrough

- Three independent hooks compose the page: `useAuditLogs` (list+pagination), `useAuditFilters` (local filter state), `useAuditUsers` (dropdown options). No shared state beyond what the page wires together.
- Changing any filter resets `currentPage` to 1 (`handleFilterChangeWrapper`), avoiding a stuck-on-an-out-of-range-page bug after a filter narrows the result set.
- **Traced the actor-display data shape end-to-end rather than trusting the UI at face value** (per this skill's mandatory step 2, given this exact class of bug has shipped before in `docs/qa/admin-settings-qa-analysis.md` §2a): `prisma/schema.prisma:3198-3216` defines `AuditLog.userId` as a plain scalar `String?` FK column, with the joined actor available only via the `user` relation. `app/api/audit-logs/route.ts:66` does `include: { user: { select: { name: true, email: true } } }`, so each row in the API response carries **both** `userId` (a bare string ID) and `user` (the `{name, email}` object) as separate fields. The page, however, called `extractUserInfo(log.userId)` — passing the raw ID string into a helper whose whole job is to unwrap a `{name, email}` object, with a `typeof x === 'object'` check that a string always fails. **Result: every single row in the table displayed "System" as the actor, regardless of who actually performed the action** — the real name/email was fetched from the database and sent over the wire but never read. This is the audit trail failing at its one job (who did what) and was present on every page load, not an edge case. See finding #1.
- Export intentionally ignores the `action`/`entityType`/`userId` filters (confirmed both client `handleExport` and server `export/route.ts` only pass/read `startDate`/`endDate`/`format`/`download`) — flagged as finding #4, since it's plausibly intentional (an unabridged "electronic journal" for BIR compliance shouldn't silently drop entries) but isn't communicated to the user, who may expect the export to match what's currently filtered on screen.

---

## 3. Findings (bugs / risks), ranked

### Critical — fixed
1. ~~Actor name/email never displayed; every row showed "System".~~ **Fixed.** See walkthrough above. Fixed by: (a) correcting the `AuditLog` interface in `hooks/useAuditLogs.ts` to model reality — `userId` is `string | null` (the raw FK, not useful for display), `user` is the separate `{name, email} | null` relation object; (b) changing `page.tsx` to call `extractUserInfo(log.user)` instead of `extractUserInfo(log.userId)`. Regression-tested in `__tests__/audit-logs-page.test.tsx` (`renders the actor name/email from the joined 'user' field, not the raw 'userId'` — asserts the real name renders and `'System'` does not; a second test confirms the `'System'` fallback still works correctly for logs with no associated user, e.g. system-initiated actions).

### High — fixed
2. ~~No rate limiting on the main audit-log list endpoint.~~ **Fixed.** Per CLAUDE.md's mandatory route order (rate limit → auth → tenantId scoping → audit → error handler), `app/api/audit-logs/route.ts` had no `checkRateLimit` call at all — confirmed by grep, and by contrast with the sibling `export/route.ts`, which already rate-limits at 10/min. Added `checkRateLimit` at 60/min per tenant (generous, since normal filter/paginate interaction legitimately fires several requests per minute, but still bounds a scripted scrape of the full log history).

### Medium — open (wiring gap, not a code bug per se)
3. **The User filter dropdown depends on a different, unrelated permission than the page itself.** `useAuditUsers` calls `GET /api/users`, which requires `users.manage` (default floor: `manager`) — not `audit_logs.view` (also default floor: `manager`, but a *separate* key). Both happen to default to the same floor today, so this is invisible out of the box. But `users.manage` and `audit_logs.view` are independently overridable per-tenant (`OVERRIDABLE_ROLES` covers `viewer`/`cashier`/`manager` — see `lib/permissions.ts`): a tenant admin could grant `cashier` access to `audit_logs.view` via Settings → Roles & Permissions without touching `users.manage`, and that cashier would get a `toast.error` on every page load (the `/api/users` call 403s) purely because of an incidental dependency having nothing to do with viewing audit logs. This is the same class of issue as [[workflow-integrity]] check 5 (UI gate ↔ server enforcement parity) but inverted — here a *feature* the page doesn't itself require is silently gated behind a stricter/different permission. **Left open**: the fix isn't obvious without a product call — either (a) add a narrower "list tenant users for filter/display purposes" permission distinct from full `users.manage`, or (b) let `/api/users` GET accept `audit_logs.view` as an alternate satisfying permission for this specific read-only use. Flagging rather than guessing which the team prefers.

### Low — open (product decision)
4. **Export ignores the Action/Entity Type/User filters currently applied on screen.** Confirmed both `handleExport` (client) and `export/route.ts` (server) only ever pass/accept `startDate`/`endDate`/`format`/`download` — a user who filters the table to "Action: delete" and then clicks Export CSV gets every action in the date range, not just deletes. Plausibly intentional for a BIR "electronic journal" (an audit export arguably should be unabridged, not silently missing rows the user happened to have filtered out), but the UI gives no indication the export ignores the visible filters — a user could reasonably assume the CSV matches what's on screen. **Left open**: needs a product call on whether export should (a) stay unfiltered by design (and say so in the UI, e.g. a note near the export buttons), or (b) start respecting the same filters as the table.

---

## 4. Suggested test matrix

Items marked `[x]` are now automated in `__tests__/audit-logs-page.test.tsx` (8 tests, all passing). Everything still `[ ]` is manual/integration-level or a follow-up not yet written.

### Permissions
- [x] `audit_logs.view=false`: access-restricted message shown, table/filters not rendered.
- [x] `audit_logs.export=false`: export buttons absent; page itself still renders.
- [x] `audit_logs.export=true`: export buttons present.
- [ ] Cross-tenant: user authenticated for tenant A cannot see tenant B's audit logs via a crafted `userId`/`entityType` filter (route.ts:38 already scopes every query by `tenantId: user.tenantId` regardless of filter values — confirmed by code read, not yet covered by an integration test hitting the real route).
- [ ] Follow-up once finding #3 is resolved: a role granted `audit_logs.view` via a tenant override but not `users.manage` no longer gets a spurious error toast from the User filter dropdown.

### Actor display (regression coverage for finding #1)
- [x] A log row with a real `user` object renders that user's name and email, not "System".
- [x] A log row with `user: null` (system-initiated action) correctly falls back to "System".

### Filters
- [x] Changing a filter resets pagination to page 1 and re-fetches with the new filter value alongside `page: 1`.
- [ ] `validateDateRange` (exists in `lib/audit-helpers.ts`, already used by the expenses page) is never called from this page — a user can pick a start date after the end date, or a range over a year, with no client-side warning; the query silently returns whatever Postgres gives back (likely zero rows for an inverted range). Worth wiring in the same way the expenses page already does, as a small follow-up — not fixed in this pass since it's a straightforward addition but outside the two concrete bugs this audit prioritized fixing.
- [ ] Selecting a User from the dropdown filters results to only that user's actions (needs a live-fetch integration test, not just asserting the request params).

### Pagination
- [x] Previous disabled on page 1; Next enabled when more pages exist.
- [ ] Next disabled on the last page (component logic (`canGoToNextPage`) already covers this and is exercised by the Previous-button test's counterpart data, but no dedicated last-page test was added — low-risk, pure function already covered indirectly).

### Data integrity
- [x] Empty result set renders the "No audit logs found" empty state instead of an empty table.
- [ ] Export CSV/JSON endpoint's actual downloaded content matches the table for the same date range, modulo finding #4's other-filters gap (integration-level — the export route isn't unit-testable through the page's mocked-fetch harness).

### Regression triggers (tie to CLAUDE.md's known incident class)
- [x] Tenant isolation confirmed by direct code read of `route.ts` (`where: { tenantId: user.tenantId }`) and `export/route.ts` (same pattern) — not grep-only.
- [x] Rate limiting present on both `GET /api/audit-logs` (this audit's fix) and `GET /api/audit-logs/export` (pre-existing).
- [x] No `.then` attached to any mock object in the new test file.

---

## 5. Recommended next steps

1. ~~Fix the actor-display bug (`log.userId` vs. `log.user`)~~ — done, see finding #1. This was the most severe finding in this file: a defense-relevant control (the audit trail) silently failing to show who did what, on every single row, since the page shipped.
2. ~~Add rate limiting to `GET /api/audit-logs`~~ — done, see finding #2.
3. **Resolve the `users.manage`/`audit_logs.view` coupling (finding #3)** — needs a product/security call on whether to introduce a narrower permission for "list tenant user names for a filter dropdown" or to let `/api/users` GET accept `audit_logs.view` as an alternate check. Until resolved, any tenant that overrides `audit_logs.view` more permissively than `users.manage` will see a confusing error toast on this page.
4. **Decide whether Export should respect the on-screen filters (finding #4)** — if the "unabridged electronic journal" behavior is intentional, add a short note near the Export buttons saying so, so users don't assume the download matches their current filter.
5. **Wire in `validateDateRange`** (already written in `lib/audit-helpers.ts`, unused by this page) so an inverted or >1-year date range gets a client-side toast instead of silently returning an empty/unexpected result set. Small, low-risk follow-up.
6. ~~Add component tests~~ — done: `__tests__/audit-logs-page.test.tsx`, 8 tests, all passing. Follow-up: the `[ ]` items in §4, particularly the cross-tenant and export-content cases, need a real integration test against a test database rather than a mocked-fetch component test.
