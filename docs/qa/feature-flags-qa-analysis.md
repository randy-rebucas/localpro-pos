# QA Analysis — Feature Flags (tenant admin)

**Component under test:** `app/[tenant]/[lang]/admin/feature-flags/page.tsx`
**Backing API:** `app/api/tenants/[slug]/settings/route.ts` (`GET`, `PUT`) via `hooks/useFeatureFlagsSettings.ts`
**Permission gate:** `settings.manage` (default floor: `manager`) via `usePermissions()`/`canAccess` client-side and `hasTenantPermission(user.role, user.tenantId, 'settings.manage')` server-side
**Existing test coverage:** none before this pass — added `__tests__/feature-flags-page.test.tsx` (13 tests)
**Status:** Audited 2026-09-21. No Critical/High bugs found. One Medium display bug (default-checked semantics diverge from every other consumer of the same fields) is documented and covered by a regression test, but left unfixed pending a product decision on the right default (see §3). One Medium product gap — several flags defined in the business-type system have no toggle in this UI at all — is flagged as open, not fixed, since adding UI surface for them is a scope call, not a bug fix.

---

## 1. Where it's wired in

| Layer | File | Role |
|---|---|---|
| Nav entry | `components/admin/AdminSidebar.tsx` | Links to `/admin/feature-flags`, gated on the same `settings.manage` permission (verified by grep; page itself never redirects, just disables inputs) |
| Page | `app/[tenant]/[lang]/admin/feature-flags/page.tsx` | Renders one checkbox per `FEATURE_FLAGS` entry, business-type banner, save button |
| Fetch | `hooks/useFeatureFlagsSettings.ts:18-59` → `GET /api/tenants/[slug]/settings` | Loads the tenant's full `TenantSettings` row (feature flags are a subset of the same table as currency/branding/tax settings) |
| Save | `hooks/useFeatureFlagsSettings.ts:81-126` → `PUT /api/tenants/[slug]/settings` | Sends the entire in-memory `settings` object, not a flags-only payload |
| Consumers of saved data | `lib/business-types.ts:applyBusinessTypeDefaults`, `lib/business-type-helpers.ts` | Every other place in the app that gates a feature reads `settings.<flag> ?? businessTypeConfig.defaultFeatures.<flag>` — see §3 Medium finding |
| Unrelated same-named system | `app/api/super-admin/feature-flags/[tenantSlug]/route.ts` + `FeatureFlagOverride` model | A **separate**, super-admin-only override mechanism keyed by tenant slug + feature string. Not read or written by this page at all — worth knowing if a bug report says "I set a feature flag override and the tenant admin page doesn't show it," since they're two independent systems sharing a name. |

## 2. Functional walkthrough

`FeatureFlagsPage` (`page.tsx:20-49`) pulls `tenant`/`lang` from the route, loads the dictionary, and calls `fetchSettings()` from `useFeatureFlagsSettings(tenant)` on mount. The hook (`useFeatureFlagsSettings.ts:18-59`) hits `GET /api/tenants/${tenant}/settings`, which returns the tenant's full `TenantSettings` row (`route.ts:14-99` — self-healing: creates a default row via `applyBusinessTypeDefaults`/`flattenSettingsForPrisma` if one doesn't exist yet). The hook then spreads the response over a 6-key default object (`enableInventory`, `enableCategories`, `enableDiscounts`, `enableLoyaltyProgram`, `enableCustomerManagement`, `enableBookingScheduling` — `useFeatureFlagsSettings.ts:35-43`), leaving the other 8 flags in `FEATURE_FLAGS` (`enableTableManagement`, `enableSuppliers`, `enableDelivery`, `enableWorkOrders`, `enableLaundryOrders`, `enableKitchenDisplay`, `enableEmployees`, `enableExpenses`) with no client-side default at all.

Each checkbox's checked state is computed as `(settings as any)[flagKey] !== false` (`page.tsx:133-134`) — i.e. "checked unless explicitly `false`." `updateSetting` (`useFeatureFlagsSettings.ts:61-79`) does a generic dot-path mutation (over-general for this flat-boolean use case, but harmless). `handleSave` calls `saveSettings(settings)`, which `PUT`s the *entire* settings object back (`useFeatureFlagsSettings.ts:91-97`), not just the flags — meaning a save from this page can also persist currency/tax/branding fields if they were present in `settings` (they are, since `GET` returns the full row). The server route's "scoped keys" logic (`route.ts:255-267`) limits persistence to `Object.keys(settings)` from the request body, so this is safe in practice — any key genuinely absent from the client's in-memory `settings` (e.g. never fetched) is simply never sent, not sent-as-null.

The `settings.manage` gate is enforced identically to the standard project pattern: server-side via `hasTenantPermission` (`route.ts:119-121`) with an explicit tenant-match check (`route.ts:158-160`) for non-super-admins, and client-side via `usePermissions().canAccess('settings.manage')` (`page.tsx:27-28`), which disables every checkbox and hides the Save button rather than blocking the whole page (unlike `roles-permissions`, which shows a full "Access Restricted" screen — see §3 Low).

## 3. Findings (bugs / risks), ranked

### Critical
None found.

### High
None found.

### Medium

1. **Default-checked semantics diverge from every other consumer of the same fields.** `page.tsx:133-134` treats a flag as ON unless the stored value is literally `false` (so `undefined` → checked). Every other place that reads these same `TenantSettings` fields — `lib/business-types.ts:applyBusinessTypeDefaults` and `lib/business-type-helpers.ts` — treats a missing value as "fall back to the business type's default," which is `false` for most of the 8 flags not backfilled by the client hook, across most business types. Net effect: a tenant whose `TenantSettings` row predates one of these flags (or a business type whose default is `false`) will see the checkbox rendered **checked** on this page while the feature is actually **off** everywhere else in the app that gates on it. Not a data-corruption risk (unmodified checkboxes aren't sent to the server — see §2), but it's a genuine "what I see doesn't match what's true" bug for anyone visually auditing their tenant's enabled features. **Open** — the fix is a product decision (should the client mirror the business-type-default fallback, or should the 8 unbackfilled flags just get added to the hook's default object like the other 6?), so left unfixed; regression test added (`feature-flags-page.test.tsx`: "defaults a flag missing from the API response to checked, even when the business-type default for it is false") to lock in current behavior and catch any accidental change in either direction.

2. **Several business-type feature flags have no toggle on this page at all.** `FEATURE_FLAG_KEYS` (`lib/business-types.ts:305-310`) includes `enableAccounting` and `enableOnAccountSales`, neither of which appears in `FEATURE_FLAGS` (`lib/feature-flags-helpers.ts:92-107`) — so a tenant admin can never toggle them from this UI, only via direct DB/API access or business-type switch. Conversely, `getFeatureFlagLabel`/`getFeatureFlagDescription` (`feature-flags-helpers.ts:29-86`) define label/description entries for `enableHardwareIntegration`, `enableAttendance`, `enableMultiCurrency`, `enableBundling`, `enableBIR` that are dead code — not in `FEATURE_FLAGS`, so never rendered. **Open** — plausibly intentional (some flags may be meant to be business-type-only, not admin-toggleable), so flagged rather than changed.

### Low

3. **No full-page "Access Restricted" gate, unlike `roles-permissions`.** Users below the `settings.manage` floor still see the whole page (title, business-type banner, every flag's label/description) with inputs disabled and Save hidden, rather than the blocked-screen pattern used on `admin/roles-permissions`. Confirmed intentional-looking (labels/descriptions are non-sensitive), but inconsistent with the sibling admin page's pattern — worth a product call on which is the house style. **Open**, not a security issue (server independently enforces the same permission).

4. **`updateSetting`'s dot-path mutation is unused generality for this page.** Every call site passes a flat key (no dots), so the `path.split('.')` traversal in `useFeatureFlagsSettings.ts:61-79` never exercises its nested-path branch here. Harmless (the hook is shared with other settings UIs that do use nested paths), not fixed.

## 4. Suggested test matrix

**Permissions**
- [x] Role below `settings.manage` floor: all checkboxes disabled, Save button absent (server independently enforces via `hasTenantPermission` — not exercised by this mocked-fetch suite).
- [x] Role at/above floor: checkboxes enabled, Save button present.
- [ ] Cross-tenant: a user authenticated for tenant A cannot PUT tenant B's `/api/tenants/{B}/settings`. Covered structurally by `route.ts:158-160`'s explicit tenant-match check, but needs a real integration/API test against a live DB to prove — not provable from a mocked-fetch component test.
- [ ] `rolePermissionOverrides` interaction: `settings.manage` can be overridden per-tenant via the Roles & Permissions page; this page's `canAccess` already reads `rolePermissionOverrides` through `hasPermission` (see `hooks/usePermissions.ts`), but no test here exercises an override specifically for `settings.manage` — worth adding if that permission is ever overridden in practice.

**Data integrity / display correctness**
- [x] Flag explicitly `true` renders checked.
- [x] Flag explicitly `false` renders unchecked.
- [x] Flag missing from the API response renders checked, even where the true business-type default is `false` (documents Medium finding #1 — intentionally asserting current, not necessarily correct, behavior).
- [x] Toggling a checkbox updates in-memory state and is reflected in the save request body.
- [ ] Business-type switch resetting flags (`route.ts:176-185`) actually reaches this page correctly on reload — needs an integration test hitting the real route, since the reset logic is server-side and this page only ever sends/receives whatever the mocked fetch returns.

**Save / error handling**
- [x] Successful save shows the success message and updates settings from the response.
- [x] Failed save (generic error) surfaces the server's error message.
- [x] Failed save with 401/403 status surfaces the unauthorized-specific message (`useFeatureFlagsSettings.ts:106-109`).
- [ ] Save request timeout/abort (20s `AbortController` in both fetch and save) — not exercised; low priority given it's a generic fetch-timeout pattern shared across the codebase.

**i18n**
- [x] Component reads every label through `dict?.admin?.*` with an English fallback string (spot-checked `getFeatureFlagLabel`/`getFeatureFlagDescription`); not re-verified against a non-English locale file in this pass since the dictionary itself is mocked to `{}` in tests (fallback strings are what's actually asserted on).
- [ ] Spot-check `es` locale has matching `admin.enable*` keys so nothing silently falls back to English in production — not done this pass.

**Accessibility**
- [x] Every checkbox has an associated `<label htmlFor>` (verified by reading `page.tsx:137-152`; not asserted via a dedicated a11y test but implicit in using `getByRole('checkbox')`/`document.getElementById` pairs successfully in the new tests).
- [ ] Keyboard-only flow (tab through all 14 checkboxes to Save) — not exercised; no custom-control semantics here (plain `<input type="checkbox">`) so risk is low.

**Regression triggers**
- [x] No `.then` attached to a mock object anywhere in `feature-flags-page.test.tsx`.
- [x] Permission check confirmed to use `hasTenantPermission`/`canAccess` floor semantics, not exact-match (inherited from the shared `settings.manage` permission, not re-implemented on this page).
- [N/A] Win8/Metro styling — this page lives under `app/[tenant]/[lang]/admin/**`, not `app/super-admin/**`, so that design system doesn't apply.

## 5. Recommended next steps

1. Decide the correct default-checked semantics for the 8 flags the client hook doesn't backfill (Medium #1) — either mirror the business-type-default fallback client-side, or extend `useFeatureFlagsSettings`'s default object to cover all 14 `FEATURE_FLAGS` keys (simplest fix, matches the other 6). Then flip the regression test's expectation to match.
2. Get a product decision on whether `enableAccounting`/`enableOnAccountSales` should be tenant-toggleable from this page, and whether the five dead-code label/description entries in `feature-flags-helpers.ts` should be wired up or deleted (Medium #2).
3. Add an integration test (real DB, two tenants) proving `PUT /api/tenants/[slug]/settings` rejects a cross-tenant request — currently only structurally guaranteed by code inspection, not test-proven.
~~4. Add component test coverage for the feature-flags page (none existed before this audit).~~
