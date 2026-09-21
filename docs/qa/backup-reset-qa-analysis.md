# QA Analysis — Collection Backup & Reset

**Component under test:** `app/[tenant]/[lang]/admin/backup-reset/page.tsx`
**Backing API:** `app/api/tenants/[slug]/reset-collections/route.ts` (`GET` backup, `POST` reset/delete, `PUT` restore)
**Permission gate:** `reset_collections.manage` (default floor: `admin`) via `usePermissions()` → `lib/permissions.ts` (`hasPermission`) client-side, `hasTenantPermission()` server-side in every handler
**Existing test coverage (before this pass):** none — no component test, no route test
**Status:** initial audit completed 2026-09-21. Two Critical/High findings fixed same day (permission-key mismatch on the sidebar nav entry; missing rate limiting on a mass-delete endpoint), plus a reliability fix (transaction timeout headroom for large tenants) and a lint cleanup. Added `__tests__/backup-reset-page.test.tsx` (13 tests, all passing) — the first automated coverage this page has had. One item remains open as a product/ops decision (§5).

---

## 1. Where it's wired in

| Layer | File | Role |
|---|---|---|
| Nav entry | [components/admin/AdminSidebar.tsx:166](components/admin/AdminSidebar.tsx#L166) | `{ label: 'Backup & Reset', href: '${base}/admin/backup-reset', permission: 'reset_collections.manage' }` |
| Page | [app/[tenant]/[lang]/admin/backup-reset/page.tsx](app/[tenant]/[lang]/admin/backup-reset/page.tsx) | Client component: Backup / Restore / Reset, three independent action sections sharing one collection-checkbox list |
| Backup fetch | `GET /api/tenants/{tenant}/reset-collections?collections=...` | Auth + `reset_collections.manage` required, exports selected tenant-scoped collections as a downloadable JSON file |
| Restore | `PUT /api/tenants/{tenant}/reset-collections` | Auth + permission required, optional `clearExisting`, transactional clear+insert |
| Reset (delete) | `POST /api/tenants/{tenant}/reset-collections` | Auth + permission required, transactional `deleteMany` across every selected collection — **irreversible** without a prior backup |
| Collection list / labels | `lib/backup-reset-helpers.ts` (`BACKUP_RESET_COLLECTIONS`) and `route.ts` (`COLLECTION_MODELS`) | Two independently maintained lists that must stay in sync (verified below, §2) |
| FK-safe delete/restore order | `route.ts` (`RESET_ORDER`, `orderCollections`) | Children-before-parents for delete, parents-first for restore insert |

This is the highest blast-radius admin page in the codebase — the Reset action permanently deletes tenant data with no soft-delete/undo, so it gets the same "verify before trusting a prior pass" treatment as the tenant-isolation and role-permission audits.

---

## 2. Functional walkthrough

- Three independent hooks (`useBackupCollections`, `useRestoreCollections`, `useResetCollections`) each own their own loading/error/result state; the page composes them but doesn't share state between them.
- Collection selection (`selectedCollections`) is shared between the Backup section and the Reset section (same checkbox list), but **not** used by Restore, which operates on whatever collections exist inside the uploaded backup file instead.
- **Reset always requires a native `confirm()` dialog** (`buildResetConfirmMessage`, listing the selected collection count and names) before calling the API — cannot be bypassed from the UI. Restore only prompts `confirm()` when "Clear existing data" is checked (data-loss path); a plain restore-without-clearing needs no confirmation, which is correct since it's non-destructive (uses `createMany({ skipDuplicates: true })`).
- Traced `BACKUP_RESET_COLLECTIONS` (UI labels) against `COLLECTION_MODELS` (server-side Prisma delegate map) key-by-key — **all 21 keys match exactly**, so the UI can't offer to back up/reset a collection the server doesn't recognize, or vice versa. Also verified `RESET_ORDER` (route.ts) contains all 21 `COLLECTION_MODELS` keys exactly once each — no collection is silently skipped during a delete/restore because it's missing from the FK-ordering list.
- Both `POST` (reset) and `PUT` (restore) wrap their multi-table writes in `dbTransaction` — confirmed atomic (all-or-nothing) per the transaction semantics in `lib/db.ts`. This matches [[workflow-integrity]]'s multi-write atomicity check.

---

## 3. Findings (bugs / risks), ranked

### Critical — fixed
1. ~~Sidebar nav entry gated on a permission key that doesn't exist.~~ **Fixed.** `AdminSidebar.tsx:166` gated the "Backup & Reset" link on `permission: 'backup_reset.manage'`, but that key is not registered anywhere in `lib/permissions.ts`'s `PERMISSIONS` array — only `reset_collections.manage` is (which the page and all three route handlers actually check). Traced the effect via `hasPermission()`: `admin`/`owner`/`super_admin` bypass the key lookup entirely (`isAlwaysAllowedRole`) so the link happened to still show for them, masking the bug — but for `viewer`/`cashier`/`manager`, `getPermissionDef('backup_reset.manage')` returns `undefined` and `hasPermission` returns `false` unconditionally. That means **an admin could never grant a manager access to this page via Settings → Roles & Permissions** — any override they set is stored under `reset_collections.manage` (the only key the Roles & Permissions UI offers), which the sidebar never reads. A manager granted access would still not see the nav link, even though navigating to the URL directly would work (the page component checks the correct key). Classic orphaned-control bug per [[workflow-integrity]] check 7. Fixed by changing the sidebar's `permission` field to `reset_collections.manage`.

### High — fixed
2. ~~No rate limiting on a mass-delete endpoint.~~ **Fixed.** Per CLAUDE.md's mandatory route order (rate limit → auth → tenantId scoping → audit → error handler), every handler in `route.ts` was missing step 1 entirely — confirmed by grep (zero hits for `checkRateLimit` in the file) and by contrast with the much less destructive `tenants/[slug]/settings/route.ts`, which does rate-limit its `PUT`. Added `checkRateLimit` to all three handlers: `GET` (backup) 10 req/min per tenant slug, `POST` (reset/delete) and `PUT` (restore) 5 req/min per tenant slug — tighter than settings' 30/min given the irreversibility of the destructive paths.

### Medium — fixed
3. ~~Transaction timeout headroom.~~ **Fixed.** Neither `dbTransaction` call in `POST`/`PUT` passed a `timeout`/`maxWait` option, so both ran under Prisma's default **5-second** transaction timeout while iterating `deleteMany`/`createMany` across up to 21 collections. A timeout still rolls back cleanly (atomicity holds — no partial-delete risk), but the reset/restore would then **always fail** for any tenant with a non-trivial amount of data, with no clear signal to the user why beyond a generic 500. Added `{ timeout: 60_000, maxWait: 10_000 }` to both transactions.

### Low — fixed
4. ~~Unused `Link` import.~~ **Fixed** — flagged by `eslint` (`no-unused-vars`), removed.

---

## 4. Suggested test matrix

Items marked `[x]` are now automated in `__tests__/backup-reset-page.test.tsx` (13 tests, all passing). Everything still `[ ]` is manual/integration-level, needs a real database, or is a follow-up not yet written.

### Permissions
- [x] `canManage=false`: all three action buttons disabled, Select All/Clear All buttons absent, every collection checkbox disabled.
- [x] `canManage=true`: actions enabled (subject to their own per-action validity checks).
- [ ] Sidebar link visibility for a role at/below the permission floor, post-fix (`AdminSidebar.tsx` is a separate component from the page under test — not covered here; worth a follow-up now that finding #1 is fixed).
- [ ] Cross-tenant: user authenticated for tenant A cannot back up/restore/reset tenant B's collections via a crafted request (route.ts:322-328-equivalent checks in each handler already enforce this server-side — needs an integration test against the real route, not a mocked component test).

### Backup
- [x] Backup button disabled when no collection is selected (via `canCreateBackup`).
- [x] `createBackup` called with exactly the selected collection keys.
- [ ] Backup download triggers a file with the expected `Content-Disposition` filename (integration-level — the download/blob mechanics live in `useBackupCollections`, not the page, and aren't easily unit-tested through jsdom).

### Restore
- [x] Restore button disabled when no file is selected.
- [x] Checking "Clear existing data" triggers a `confirm()` dialog before restoring; declining aborts without calling `restore()`.
- [x] Leaving "Clear existing data" unchecked restores without any confirm prompt.
- [ ] Invalid JSON / missing `collections` key in the uploaded file is rejected with a toast before any network call (`useRestoreCollections`' own validation — worth a hook-level unit test, not covered by this component test since the page doesn't own that validation).
- [ ] Backup version mismatch (`version !== '2.0'`, e.g. a pre-migration Mongo-era backup) is rejected server-side with the documented "cannot be restored here" message (route.ts:347-358) — integration-level.

### Reset (destructive path)
- [x] Reset button disabled when no collection is selected.
- [x] `confirm()` always shown before calling `reset()`; declining aborts.
- [x] `reset()` called with exactly the selected collection keys.
- [x] Selection clears after a successful reset.
- [ ] A failure partway through the transaction (e.g. simulated FK violation) leaves **zero** collections deleted, not a partial reset — needs an integration test against a real/test database exercising `dbTransaction`'s rollback, not mockable at the component level.
- [ ] Cross-tenant: `deleteMany({ where: { tenantId } })` in every model call is confirmed scoped by `tenant.id` in the code (route.ts:270-274) but not exercised by an automated test that two tenants' data can't cross-contaminate.

### Select all / clear all
- [x] Select All checks every collection; Clear All unchecks every collection.

### Data integrity / FK ordering
- [x] (Static verification, not a runtime test) `BACKUP_RESET_COLLECTIONS` keys == `COLLECTION_MODELS` keys == `RESET_ORDER` keys, all 21, no gaps — confirmed via direct comparison during this audit; worth converting into an automated `lib/backup-reset-helpers.test.ts` assertion so a future new collection added to one list but not the others fails CI instead of failing silently in production.

### Regression triggers (tie to CLAUDE.md's known incident class)
- [x] Tenant isolation: every `COLLECTION_MODELS` read/write in `route.ts` is scoped by `tenantId: tenant.id`, confirmed by direct code read (not grep-only) across `GET`/`POST`/`PUT`.
- [x] Rate limiting present on all three verbs (this audit's fix, §3 finding #2).
- [x] No `.then` attached to any mock object in the new test file.

---

## 5. Recommended next steps

1. ~~Fix the `backup_reset.manage`/`reset_collections.manage` sidebar mismatch~~ — done, see finding #1. **Recommend also adding a lightweight lint/test rule** that every `permission:` value in `AdminSidebar.tsx` exists in `PERMISSIONS` (`lib/permissions.ts`) — this exact class of bug (a UI referencing an unregistered permission key) is easy to reintroduce on the next nav entry and silently defeats the Roles & Permissions override feature. Not implemented in this pass (would touch the nav config broadly, out of scope for this slice) — flagging per [[workflow-integrity]] check 7 for a follow-up.
2. ~~Add rate limiting to the reset-collections route~~ — done for all three verbs, see finding #2.
3. ~~Add transaction timeout headroom~~ — done for both `POST` and `PUT`, see finding #3.
4. ~~Add component tests~~ — done: `__tests__/backup-reset-page.test.tsx`, 13 tests, all passing. Follow-up (not blocking): the `[ ]` items in §4, particularly the transaction-rollback and cross-tenant cases, need a real integration test against a test database rather than a mocked-fetch component test.
5. **Open — product/ops decision, not a code fix:** should this page require a *second* confirmation step (e.g. typing the tenant name, matching many "delete my account" flows) given that Reset is an irreversible mass-delete with no backend soft-delete? The current single `confirm()` dialog matches the pattern used elsewhere in the admin panel (e.g. the settings page's unsaved-changes guard), but this action's blast radius (entire collections, permanently, tenant-wide) is categorically larger than anything else gated that way. Flagging for a product call rather than guessing at the right UX.
