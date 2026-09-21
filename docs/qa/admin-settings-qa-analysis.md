# QA Analysis — Admin Settings Page

**Component under test:** `app/[tenant]/[lang]/admin/settings/page.tsx`
**Backing API:** `app/api/tenants/[slug]/settings/route.ts` (`GET`, `PUT`)
**Permission gate:** `settings.manage` via `usePermissions()` → `lib/permissions.ts` (`hasPermission`) and server-side `hasTenantPermission()` in `lib/permissions-server.ts`
**Existing test coverage:** `__tests__/tenant-settings-api.test.ts` (API route only — **no component-level test exists for this page**)
**Status:** initial audit completed 2026-09-21; addressable findings (#2, #4, #5, #6, #7 below) fixed same day in `page.tsx` + `route.ts`, verified via `tsc --noEmit`, `eslint`, and the existing 9-test API suite (all pass). Finding #8 (no component tests) closed same day — added `__tests__/admin-settings-page.test.tsx` (13 tests, all passing). A same-day data-loading follow-up (§2a) found and fixed a critical bug: the Contact tab's address fields always loaded blank due to a flat-vs-nested API shape mismatch, present on both settings pages — fixed in `page.tsx` and the shared `hooks/useSettingsPage.ts`. Full suite (446 tests) passes with no regressions. Two items remain open, both product decisions rather than code fixes: finding #1 (duplicate settings pages) and the untoggleable-feature-flags gap (§2a). See §3 and §5.

---

## 1. Where it's wired in

| Layer | File | Role |
|---|---|---|
| Nav entry | [components/admin/AdminSidebar.tsx:169](components/admin/AdminSidebar.tsx#L169) | `{ label: 'Settings', href: '${base}/admin/settings', permission: 'settings.manage' }` — sidebar hides the link entirely if the role lacks `settings.manage` |
| Page | [app/[tenant]/[lang]/admin/settings/page.tsx](app/[tenant]/[lang]/admin/settings/page.tsx) | Client component, tabbed form (General / Branding / Contact / Receipt / Features / Notifications) |
| Fetch | `GET /api/tenants/{tenant}/settings` | Public (no auth) — returns `TenantSettings` row, self-healing (creates a default row if missing) |
| Save | `PUT /api/tenants/{tenant}/settings` | Auth required, `settings.manage` permission required, rate-limited (30 req/min per tenant slug) |
| Consumers of saved data | `contexts/TenantSettingsContext.tsx` (`refreshSettings()` called after save), `AdminSidebar.tsx` (feature flags gate nav items via `supportsFeature`), receipts (`lib/automations/transaction-receipts.ts`, `lib/hardware/receipt-printer.ts`), POS checkout flows (tax/currency), business-hours page (`timezone`) | Anything reading `TenantSettingsContext` reacts to a save here |

**⚠️ Duplicate settings surface found:** [app/[tenant]/[lang]/settings/page.tsx](app/[tenant]/[lang]/settings/page.tsx) is a *second*, more feature-rich settings page (multi-currency display, receipt template manager, e-commerce integrations, real logo upload via `ImageUploadField` instead of a raw URL field) that **posts to the same `PUT /api/tenants/{tenant}/settings` endpoint** and gates on the same `settings.manage` permission. Confirm with the team which route is canonical — as written, two independently-maintained UIs can drift out of sync with each other and with the API's field set, and QA needs to know which one is "the" settings page before writing regression suites against it.

---

## 2. Functional walkthrough

- Local `FormData` state is initialized with hardcoded defaults, then overwritten by `GET` response in `fetchSettings()` (nullish-coalescing per field, so a `null`/`undefined` server value falls back to the default rather than blanking the field). The fetched result is also stored as a `savedForm` snapshot, used as the "last known good" baseline for the unsaved-changes check below.
- Six tabs share one `form` state object; `SECTION_FIELDS` maps each tab to the subset of keys it owns.
- **Save is scoped to the active tab only** (`handleSave` builds `payload` from `SECTION_FIELDS[activeSection]`), explicitly to avoid a stale read of other tabs clobbering concurrent edits (comment at [page.tsx:228-230](app/[tenant]/[lang]/admin/settings/page.tsx#L228-L230)). The API mirrors this: it three-way-merges `defaults → existingSettings → incoming` then persists only `submittedKeys` ([route.ts:216-223](app/api/tenants/[slug]/settings/route.ts#L216-L223)). `savedForm` is updated on successful save so the dirty-check baseline advances.
- **Switching tabs with unsaved edits now prompts a confirm dialog** (`switchSection`/`isSectionDirty`, [page.tsx:214-226](app/[tenant]/[lang]/admin/settings/page.tsx#L214-L226)) — it diffs the active tab's fields against `savedForm` and, if dirty, requires confirmation before discarding them and reverting `form` to the saved snapshot.
- Validation is **client-side, per-tab, on save only** (`validateActiveSection`): currency code length, hex color regex, **https-only logo URL**, tax rate range, **tax label / receipt header / receipt footer max length**, **low-stock threshold range**. The server re-validates the same set independently ([route.ts:187-240](app/api/tenants/[slug]/settings/route.ts#L187-L240)) — the two validators still aren't shared code, so any future addition to one must be manually mirrored in the other (server also validates `accentColor`/`backgroundColor`/`textColor`, which don't exist on this page's form at all).
- Selecting a currency code now auto-fills `currencySymbol` via `lib/currency.ts`'s `getCurrencySymbol()`; the field stays editable for tenants that want a non-default glyph.
- `fieldset disabled={!canManage}` disables every input for read-only roles, plus a yellow banner. The Save button itself is only rendered `{canManage && ...}`.

---

## 2a. Data-loading audit (2026-09-21 follow-up)

Prompted by "are all settings actually being captured on load" — cross-checked every field the page reads from `GET` against what the API actually returns (the raw `TenantSettings` Prisma row, flat columns, per `prisma/schema.prisma:481-681`), rather than assuming the mapping in `fetchSettings` was correct.

- **Confirmed bug, fixed:** `fetchSettings` read `s.address?.street` / `.city` / `.state` / `.zipCode` / `.country` — but the API response has **no nested `address` object**, only flat `addressStreet`/`addressCity`/`addressState`/`addressZipCode`/`addressCountry` columns (the nesting only exists on the *write* side, via `lib/tenant-settings-flatten.ts`, which flattens the PUT payload before it hits Prisma). So `s.address` was always `undefined`, and **the Contact tab's Street/City/State/ZIP/Country fields silently reset to blank on every page load**, even for tenants who had saved real address data. Saves themselves worked correctly (`payload.address = {...}` on PUT is flattened server-side), so the underlying data was never lost — it just never displayed back. Fixed in `page.tsx` (read the flat columns directly) and regression-tested in `__tests__/admin-settings-page.test.tsx` (`address fields load from the flat GET response`); verified the test fails without the fix and passes with it.
- **Same bug found in the sibling page** ([app/[tenant]/[lang]/settings/page.tsx](app/[tenant]/[lang]/settings/page.tsx), lines ~940-980) via its shared `hooks/useSettingsPage.ts` data hook — same `settings.address?.street` pattern, same always-`undefined` result. Fixed at the hook level (`reshapeAddress()` in `useSettingsPage.ts` reconstructs the nested `address` object from the flat GET response before it's merged into state), so both pages are corrected by one change. Not separately regression-tested (out of scope for this pass — that page has no test file at all; see the open item in §5).
- **New finding — missing feature-flag coverage:** the Prisma schema and `lib/business-types.ts`'s `FEATURE_FLAG_KEYS` (the set of flags reset on a business-type switch, same tier as `enableInventory`/`enableCategories`/etc.) include five flags — `enableDelivery`, `enableWorkOrders`, `enableLaundryOrders`, `enableKitchenDisplay`, `enableAccounting` — that **have no toggle UI anywhere in the codebase** (confirmed via a repo-wide grep of `app/`). Each one gates a real, linked sidebar nav item (`components/admin/AdminSidebar.tsx`: Delivery, Work Orders, Laundry Orders, Kitchen Display, Ledger/accounting), so a tenant can never manually turn these modules on or off — they're permanently locked to whatever `applyBusinessTypeDefaults()` set at signup/business-type-switch time. This may be intentional (these read as more "structural" than the other togglable flags), but it's inconsistent with every other `enable*` flag having a toggle, and worth a product decision the same way finding #1 does. *(Open — not fixed, needs a product call on whether these should be exposed, and where.)*

---

## 3. Findings (bugs / risks), ranked

### Critical — fixed
0. ~~Contact-tab address fields (Street/City/State/ZIP/Country) always loaded blank~~ — **Fixed**, see §2a. This was the highest-severity finding in this file: silent data loss *in the UI* (not the database) on every page load, on both settings pages.

### High
1. **Two independently maintained settings UIs writing to the same API resource.** *(Open — product decision, not code-fixable unilaterally.)* Field sets differ (e.g., logo is a raw text URL here vs. a real upload component on the other page; no multi-currency/e-commerce/receipt-template tabs here). Divergent client-side validation increases the odds of one UI persisting a state the other can't represent or re-render correctly. *(Recommend: confirm intended ownership, then either delete/redirect the stale one or explicitly document the split.)*

### Medium — fixed
2. ~~Logo field is an unsanitized `<img src>` from free-text input.~~ **Fixed:** logo URLs are now required to match `^https:\/\/[^\s"'<>]+$` client-side (blocking `javascript:`/`data:`/bare strings) before save, mirrored server-side with an `http(s)`-only check in `route.ts`; the preview only renders for a value that passes the check, and `onError` hides a broken image instead of leaving a broken-icon render.
3. **Client validation only checks the active tab**, not the whole form. *(By design — unchanged.)* If a user edits Branding with an invalid hex, switches to Contact without saving, then saves Contact, the invalid Branding value sitting in local state isn't re-validated until that tab is saved again. Documented behavior, not a bug — covered by test matrix item below.
4. ~~No guard against silently discarding unsaved tab edits.~~ **Fixed:** switching tabs now diffs the active tab's fields against the last-saved snapshot and prompts a confirm dialog before discarding unsaved edits (`switchSection`/`isSectionDirty` in `page.tsx`).
5. ~~`lowStockThreshold` had no upper bound.~~ **Fixed:** capped at 100,000 client-side (`max` attribute + `validateActiveSection`) and server-side in `route.ts`.

### Low — fixed
6. ~~Currency symbol was free text, independent of currency code.~~ **Fixed:** selecting a currency now auto-fills `currencySymbol` from `lib/currency.ts`'s `getCurrencySymbol()`; the symbol field remains editable afterward for tenants that want a custom glyph.
7. ~~`taxLabel`/`receiptHeader`/`receiptFooter` had no max length.~~ **Fixed:** `taxLabel` capped at 32 chars, `receiptHeader`/`receiptFooter` capped at 500 chars, enforced via `maxLength` + `validateActiveSection` client-side and mirrored server-side in `route.ts`.
8. ~~No component-level tests exist.~~ **Fixed:** added `__tests__/admin-settings-page.test.tsx` (12 tests) covering permission-gated rendering, per-tab save payload scoping, the unsaved-changes tab-switch guard, and the new logo/tax-label/low-stock-threshold/currency-symbol validation. Several sub-cases from the test matrix in §4 remain un-automated — see the `[ ]` items there (concurrent-edit races, business-type-switch reset, cross-tenant enforcement, and some validation boundary values need either a real backend integration test or are simply not yet written).

---

## 4. Suggested test matrix

Items marked `[x]` are now automated in `__tests__/admin-settings-page.test.tsx` (12 tests, all passing — see §5). Everything still `[ ]` is manual/integration-level and not yet covered.

### Permissions
- [x] Role below `settings.manage` floor: read-only banner renders, all inputs disabled (`fieldset`), Save button absent.
- [x] Role at/above floor: full edit access, banner absent, Save button present.
- [ ] Sidebar link hidden for a role below the floor (this is `AdminSidebar.tsx`, a separate component from the page under test — not covered here).
- [ ] Tenant-scoped override (`rolePermissionOverrides` from the settings payload) correctly flips `canAccess('settings.manage')` client-side to match server enforcement.
- [ ] Cross-tenant: user authenticated for Tenant A cannot PUT settings for Tenant B's slug (route.ts:157-160 already checks this server-side — verify with an integration test hitting the real route, not just a mocked unit test).

### Per-tab save scoping
- [x] Editing General only sends General's keys in the PUT body; fields owned by other tabs (`logo`, `taxRate`, `lowStockThreshold`) are absent from the payload.
- [ ] Concurrent edits: Tab A save by User 1 does not get overwritten by a stale Tab B save from User 2 (this is the entire reason for the per-tab payload design — needs an integration test against the real API, not a component test with a mocked `fetch`).
- [ ] Business type switch resets unspecified feature flags to the new type's defaults (server logic at route.ts:176-185) — verify client reflects the reset after `refreshSettings()`.

### Validation (client + server, matched pairs)
- [ ] Currency code not 3 chars → client blocks save; if client bypassed, server also returns 400.
- [ ] Hex color: valid 3-digit, valid 6-digit, invalid (`#GGG`, missing `#`, empty) for both Primary and Secondary.
- [ ] Tax rate: boundary values 0, 100, -1, 100.01, non-numeric input via number field.
- [x] Logo URL: `https://...` accepted with preview rendered; `http://...` rejected with a toast and no PUT sent; `javascript:` scheme rejected with no preview rendered.
- [ ] Logo URL edge cases not yet automated: `data:` scheme, bare string with no scheme, empty (no preview, no validation error), a valid `https://` URL that 404s (client renders `<img>`, `onError` should hide it — verify no broken-image icon flashes).
- [x] Tax label over 32 chars rejected with a toast and no PUT sent (tested via `fireEvent.change` to bypass the `maxLength` DOM attribute, isolating the JS validation itself).
- [ ] Tax label exactly 32 chars (boundary-accept case), receipt header/footer length boundaries (500/501 chars).
- [x] Low stock threshold above the 100000 cap rejected with a toast and no PUT sent.
- [ ] Low stock threshold boundary-accept cases (1, 100000) and below-minimum (0) rejection.
- [x] Currency auto-fill: switching currency code updates `currencySymbol` to the matching glyph (USD → `$`).
- [ ] Manually overriding the symbol, then changing currency again — confirm it *does* re-derive (intended behavior) rather than preserving the manual override, since a tenant who customized the symbol first could find this surprising.

### Unsaved-changes guard
- [x] Dirty a field on Tab A, click Tab B → `window.confirm` invoked; declining keeps Tab A active with the edit intact.
- [x] Confirming the dialog switches to Tab B and reverts Tab A's field to its last-saved value.
- [x] Clicking the already-active tab is a no-op regardless of dirty state — no confirm dialog fires.
- [ ] Dirty a field, click Save (not switching tabs) → no confirm dialog fires; the dirty baseline (`savedForm`) advances so re-clicking the same tab afterward is a no-op.

### Data integrity / persistence
- [x] Reload after save reflects persisted values for the address sub-fields specifically (the flat-vs-nested bug from §2a) — regression-tested via `address fields load from the flat GET response`.
- [ ] Reload after save reflects persisted values for every other field (no optimistic-UI drift) — only address was audited field-by-field against the raw API shape; worth doing the same trace for every `FormData` key to rule out a similar flat/nested mismatch elsewhere.
- [ ] `TenantSettings` row auto-created (self-heal path, route.ts:63-80) for a tenant with no existing row — company name defaults to `Tenant.name`.
- [ ] `refreshSettings()` after save propagates new values into `AdminSidebar` (feature-flag-gated nav items appear/disappear) and other consumers without a full page reload.

### i18n
- [ ] All labels/placeholders fall back correctly when `dict` is `null` during initial load (every label already has a hardcoded English fallback — verify Spanish (`es`) dictionary has matching keys under `settings.*` so nothing falls back silently in production).

### Accessibility / UX
- [ ] Keyboard-only tab navigation through the section nav and form fields.
- [ ] Toggle switches (`Toggle` component) are operable via keyboard and expose accessible labels (currently a `<label>`-wrapped checkbox — should be fine, verify with a screen reader).
- [ ] Loading state (spinner) and disabled-fieldset state are announced to assistive tech.

### Regression triggers (tie to CLAUDE.md's known incident class)
- [ ] Re-run the tenant-isolation checks specifically for this endpoint given the project's documented history of cross-tenant leaks on other settings-adjacent endpoints (subscriptions).

---

## 5. Recommended next steps

1. ~~Fix the address fields always loading blank~~ — done, see §2a. Fixed in both `page.tsx` (direct read) and `hooks/useSettingsPage.ts` (`reshapeAddress()`, fixing the sibling settings page too). Regression-tested for the admin page; **the sibling page (`app/[tenant]/[lang]/settings/page.tsx`) has no test file at all**, so its fix is unverified by an automated test — worth a follow-up test once/if that page's ownership question (next item) is resolved.
2. **Resolve the two-settings-pages question (finding #1)** — still open, and it changes the scope of any future work here: confirm with the team which of `app/[tenant]/[lang]/admin/settings/page.tsx` and `app/[tenant]/[lang]/settings/page.tsx` is canonical, then either delete/redirect the stale one or explicitly document the split so QA knows which surface to regress and which test suite is authoritative.
3. **Decide whether the five untoggleable feature flags (§2a) are intentional** — `enableDelivery`/`enableWorkOrders`/`enableLaundryOrders`/`enableKitchenDisplay`/`enableAccounting` gate live sidebar nav items but have no UI anywhere to turn them on/off manually; a tenant is stuck with whatever the business-type default assigned. If not intentional, add toggles to the Features tab (same pattern as the existing 11) on whichever page is deemed canonical per item 2.
4. ~~Add component tests (finding #8)~~ — done: `__tests__/admin-settings-page.test.tsx`, 13 tests, all passing. Follow-up (not blocking): fill in the `[ ]` gaps left in §4 — currency-code/hex-color/tax-rate validation cases, boundary-accept values (as opposed to just the over-limit rejections already covered), the business-type-switch reset behavior, and (per item 3 above) an equivalent test file for the sibling settings page, which currently has none.
5. ~~Add an upper bound to `lowStockThreshold` and a max length to `taxLabel`/`receiptHeader`/`receiptFooter`~~ — done, client (`page.tsx`) + server (`route.ts`), matched validation on both sides, now regression-tested.
6. ~~Derive `currencySymbol` from `currency`~~ — done; symbol auto-fills on currency change and remains user-editable; regression-tested.
7. ~~Sanitize the logo URL~~ — done; both client and server now require `https://` and reject any other scheme, closing the `javascript:`/`data:` injection surface; regression-tested.
8. ~~Guard against silently discarding unsaved edits on tab switch~~ — done via `switchSection`/`isSectionDirty`; regression-tested.
9. **Concurrent-edit / cross-tenant / business-type-reset cases (from §4)** need a real integration test against the live API route rather than a component test with a mocked `fetch` — worth a follow-up in whatever suite already exercises `route.ts` against a test database, if one exists.
