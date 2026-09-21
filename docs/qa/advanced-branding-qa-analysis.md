# QA Analysis — Advanced Branding (tenant admin)

**Component under test:** `app/[tenant]/[lang]/admin/advanced-branding/page.tsx`
**Backing API:** `app/api/tenants/[slug]/settings/route.ts` (`GET`, `PUT` — shared with every other settings tab)
**Permission gate:** `settings.manage` (default floor: `manager`) via `usePermissions()`/`canAccess` client-side (hides Save entirely, no `disabled` fieldset like sibling pages — see §3 Low) and `hasTenantPermission(...)` server-side
**Existing test coverage:** none before this pass — added `__tests__/advanced-branding-page.test.tsx` (8 tests) and 2 regression tests to `__tests__/tenant-settings-api.test.ts`
**Status:** Audited 2026-09-22. Found and fixed a Critical bug: the entire Advanced Branding feature (custom fonts, custom CSS) never worked, anywhere in the app, since it was first built — not just "doesn't save," but the app-wide provider that's supposed to *apply* a tenant's configured font/CSS to every page never read the data either, because of a naming mismatch between the client type and the server's flatten map. Fixed at the root (renamed the flatten map key, centralized one reshape function used by both consumers) rather than patching each symptom. Also closed a validation gap this fix newly makes exploitable (font URLs now actually persist and get injected into `<link>`/`@font-face` tags) and a bug in the save hook's own error handling that the validation fix's own tests caught. No findings left open above Low.

---

## 1. Where it's wired in

| Layer | File | Role |
|---|---|---|
| Page | `app/[tenant]/[lang]/admin/advanced-branding/page.tsx` | Font source/family/URL fields, custom CSS textarea, Save |
| Fetch/save | `hooks/useBrandingSettings.ts` / `hooks/useBrandingSave.ts` → `/api/tenants/{tenant}/settings` | Same shared settings endpoint every other tab uses |
| Flatten (write) | `lib/tenant-settings-flatten.ts`'s `NESTED_FLATTEN_MAP.advancedBranding` (renamed this pass, was `customTheme`) | Maps `advancedBranding.{fontFamily,fontSource,googleFontUrl,customFontUrl,theme,customThemeCss,borderRadius,customBorderRadius}` to their flat `TenantSettings` columns |
| Reshape (read) | `lib/tenant-settings-flatten.ts`'s `reshapeAdvancedBranding` (new this pass) | Nests the flat GET response back under `advancedBranding` — shared by both consumers below, not duplicated |
| **App-wide consumer** | `contexts/TenantSettingsContext.tsx` | The actual mechanism that injects the tenant's configured Google Font `<link>`, `@font-face`, and custom `<style>` CSS into `document.head` on **every** tenant-facing page, not just this admin page |
| Validation | `app/api/tenants/[slug]/settings/route.ts` (server, new this pass), `app/[tenant]/[lang]/admin/advanced-branding/page.tsx`'s `handleSave` (client, new this pass) | https-only scheme check on `googleFontUrl`/`customFontUrl`; brace-balance check on `customThemeCss` via the previously-orphaned `validateCustomCSS` |

## 2. Functional walkthrough

`ITenantSettings.advancedBranding` (`types/tenant.ts`) is the nested shape this page, and `TenantSettingsContext`, both read/write. The real `TenantSettings` Prisma columns are flat (`fontFamily`, `fontSource`, `googleFontUrl`, `customFontUrl`, `theme`, `customThemeCss`, `borderRadius`, `customBorderRadius` — `prisma/schema.prisma:665-673`). Bridging that gap is `lib/tenant-settings-flatten.ts`'s job for every other settings section (`address`, `hardware`, `customTheme` as it was named, etc.) — but its map was keyed **`customTheme`**, and no page anywhere ever sent a top-level `customTheme` object; the page nests everything under `advancedBranding` instead (and one level deeper than that for the CSS field: `advancedBranding.customTheme.css`, not the map's flat `customThemeCss`). `flattenSettingsForPrisma`'s fallback for an unrecognized top-level key is to silently drop it (`lib/tenant-settings-flatten.ts`'s own module doc: *"Unknown keys are dropped rather than thrown"*). Net effect: every save from this page produced a "saved successfully" toast while **persisting nothing at all** — the PUT request's `advancedBranding` key vanished into that fallback.

That alone would already be Critical, but it's not the worst of it. `GET /api/tenants/[slug]/settings` returns those same flat columns directly — never nested under `advancedBranding` — and `contexts/TenantSettingsContext.tsx` (the provider every tenant page wraps in) merged the raw GET response with no reshape at all (`{ ...defaultSettings, ...data.data }`). Its own font/custom-CSS injection effect (`TenantSettingsContext.tsx:94-131`) reads `settings?.advancedBranding` — which was therefore *always* `undefined`, regardless of what was in the database. So even a tenant whose branding data had somehow gotten into the DB correctly (e.g. via direct SQL, or a future fix that only touched the write side) would still never see their custom font or CSS applied anywhere, because the one piece of code responsible for applying it never had a code path where `branding` was truthy.

**Fixed** at the root, not per-symptom: renamed `NESTED_FLATTEN_MAP`'s key from `customTheme` to `advancedBranding` (write side); flattened `ITenantSettings.advancedBranding.customTheme.css` down to `advancedBranding.customThemeCss` (one level of nesting, matching every other section — the double-nesting was itself part of why this drifted, since it doesn't fit the flatten map's one-level-only mapping shape); and added one `reshapeAdvancedBranding` function in `lib/tenant-settings-flatten.ts`, imported by both `hooks/useBrandingSettings.ts` (the admin page) and `contexts/TenantSettingsContext.tsx` (the app-wide provider) — centralized specifically because two independent, previously-unsynced copies of this logic is how the bug class recurs (see `docs/qa/multi-currency-qa-analysis.md` and `docs/qa/holidays-qa-analysis.md` for the same nested/flat mismatch found and fixed the same way on other pages, always as one-off per-hook reshapes until now).

Since these font URL fields and the CSS field had never actually persisted before, their validation had never been exercised either. Fixing the write path activates a previously-dormant injection surface: `googleFontUrl`/`customFontUrl` render into a `<link href>` / `@font-face { src: url(...) }`, and `customThemeCss` renders raw into a `<style>` tag, both via `contexts/TenantSettingsContext.tsx`, both now reachable app-wide the moment a save actually works. Added the same https-only scheme check the settings route already enforces for `logo` (`route.ts:258-263`) to `googleFontUrl`/`customFontUrl`, both server-side (new) and client-side (new, `handleSave`) — and wired up `validateCustomCSS` (`lib/branding-helpers.ts`), a brace-balance sanity check that already existed in the codebase but had no caller anywhere, into the same client-side pre-save check.

While writing the "server rejects a bad URL" regression test, found that `useBrandingSave.save` threw a generic `HTTP 400: Failed to save settings` on any non-401/403 error response **without ever reading the response body** — so the specific, newly-added validation message (`"Font URL must be a valid https:// address"`) would never reach the admin; they'd see a useless generic error instead. **Fixed** by reading the JSON body before branching on `res.ok`, matching the pattern every other save hook in this codebase already uses (e.g. `useMultiCurrencySettings.saveSettings`).

Custom CSS is intentionally *not* sanitized beyond the brace-balance check — it's injected verbatim into a `<style>` tag by design (the feature's whole purpose is "give the tenant an escape hatch for arbitrary styling"), gated by `settings.manage`, scoped to that tenant's own pages. This mirrors the trust boundary the codebase already accepts for `receiptHeader`/`receiptFooter`/`logo` (admin-controlled content rendered back into the tenant's own UI) — not something this pass treats as a vulnerability to remediate, since doing so would defeat the feature.

## 3. Findings (bugs / risks), ranked

### Critical
1. **The entire Advanced Branding feature never worked, anywhere.** Not "the admin page's save button was broken" — the app-wide `TenantSettingsContext` that's supposed to *apply* the configured font/CSS to every tenant page never read the data at all, independent of whether the save path worked. Two separate, previously-undiscovered bugs (flatten-map key mismatch on write; missing reshape on read, duplicated across two consumers that had silently drifted apart) combined to make this a fully inert feature since it was introduced. **Fixed** — see §2.

### High
None found beyond the above (assessed as the one Critical, not split into multiple, since both root causes had to be fixed together for the feature to work at all — fixing only one would have left it just as broken).

### Medium
2. **Newly-activated injection surface had no validation until this pass.** `googleFontUrl`/`customFontUrl` render into `<link>`/`@font-face` tags app-wide; since the write path never worked before, this was never exploitable in practice, but fixing the write path made it live. **Fixed** — same https-only pattern as `logo`, both server- and client-side.
3. **`useBrandingSave` discarded the server's actual error message on any 400.** Would have made the validation added in #2 nearly useless in practice — the admin would see "HTTP 400: Failed to save settings" instead of "Font URL must be a valid https:// address." **Fixed**.

### Low
4. **No client-side `disabled` fieldset for read-only users, unlike `feature-flags`/`multi-currency`.** This page hides the Save button entirely for a user below `settings.manage` but leaves every input fully editable (they just can't submit). Sibling pages wrap the whole form in a `disabled` `<fieldset>`. Inconsistent, not a security issue (server independently enforces the permission) — flagged as a house-style question, not fixed.
5. **`customTheme.variables` (a `Record<string, string>` sub-field, backed by a real `TenantThemeVariable` table in the schema) was dropped from `ITenantSettings.advancedBranding` entirely rather than fixed**, since it had no UI anywhere on this page, no API route, and only a one-time Mongo-migration script (`scripts/sync-mongo-updates.ts`, untouched by this pass — it reads the legacy Mongo shape independently) referenced it. Removing dead, never-wired type surface rather than fixing a mismatch that was never exercised by any real code path. If a future "custom CSS variables" UI is built, it'll need its own dedicated route (matching the array-shaped-sections pattern — holidays, exchange rates — since `TenantThemeVariable` is a separate table, not a `TenantSettings` column).

## 4. Suggested test matrix

**Permissions**
- [x] Save button hidden for a role below `settings.manage`.
- [ ] Server-side rejection for a sub-manager role's PUT — inspected (`hasTenantPermission(..., 'settings.manage')`, shared with every other settings tab) and looks correct, not integration-tested here specifically.
- [ ] Cross-tenant isolation on the shared settings route — covered generically by `tenant-settings-api.test.ts`'s existing tests, not re-verified specifically for `advancedBranding` fields.

**Data integrity (the core of this pass)**
- [x] Flat GET response correctly reshapes into the nested `advancedBranding` object the page consumes (component-level regression test).
- [x] A submitted `advancedBranding` object correctly flattens into its real Prisma columns on PUT (API-level regression test in `tenant-settings-api.test.ts`, asserting the exact `upsert` call).
- [ ] `contexts/TenantSettingsContext.tsx`'s own font/CSS-injection effect (the app-wide consumer) — fixed and verified by code inspection (same `reshapeAdvancedBranding` import as the admin page's hook), but not covered by a dedicated component test in this pass; that context is consumed by the entire tenant app shell and would need a broader test setup than this slice's scope. Flagged as the highest-value follow-up.
- [x] Font-source toggle correctly shows/hides the Google vs. Custom URL field.

**Validation**
- [x] Client rejects a non-https Google Font URL before saving.
- [x] Client rejects unbalanced custom CSS braces before saving.
- [x] Server independently rejects a non-https font URL that bypasses the client check (API-level test).
- [x] Save hook surfaces the server's actual validation message instead of a generic HTTP-status string (regression test for finding #3).

**Save / error handling**
- [x] Retry-able error state when the initial settings fetch fails.
- [x] Success toast + inline message on a successful save.

**i18n**
- [x] New validation strings (`invalidFontUrl`) follow the existing `dict?.validation?.*`/fallback-literal pattern, matching `invalidLogoUrl`.
- [ ] Spot-check `es` locale — not done this pass.

**Accessibility**
- [x] Every field is a standard labeled `<input>`/`<select>`/`<textarea>`; no custom controls introduced.
- [ ] Keyboard-only flow — not exercised; low risk given plain native controls.

**Regression triggers**
- [x] No `.then` attached to a mock object anywhere in `advanced-branding-page.test.tsx` or the new `tenant-settings-api.test.ts` cases.
- [x] Full pre-existing `tenant-settings-api.test.ts` suite re-run after the flatten-map/route changes — all pass, no other section's flattening affected (the rename only touched the `advancedBranding`/`customTheme` key; every other `NESTED_FLATTEN_MAP` entry is untouched).
- [x] Full project test suite re-run (540 tests) — clean aside from one pre-existing flake in an unrelated, untouched file (`roles-permissions-page.test.tsx`, confirmed passing standalone both before and after this pass).
- [x] `tsc --noEmit` diffed against the pre-change baseline — zero new errors.
- [N/A] Win8/Metro styling — this page lives under `app/[tenant]/[lang]/admin/**`, not `app/super-admin/**`.

## 5. Recommended next steps

1. Add a dedicated test for `contexts/TenantSettingsContext.tsx`'s font/CSS-injection effect — the highest-value remaining gap, since it's the actual mechanism that makes this feature visible to end users, and nothing in this pass exercises it directly (only verified by code inspection that it now imports the same shared reshape).
2. Decide whether `advancedBranding` inputs should be wrapped in a `disabled` `<fieldset>` for read-only users, matching `feature-flags`/`multi-currency` (Low #4) — a house-style consistency call, not a bug.
3. If a "custom CSS variables" editor is ever built, give it its own route backed by `TenantThemeVariable` (Low #5) rather than trying to fit it back into the flat `TenantSettings` shape.
~~4. Add component test coverage for the advanced-branding page (none existed before this audit).~~
~~5. Fix the root-cause bug: the entire feature never worked, on read or write, anywhere in the app.~~
~~6. Add validation for the newly-activated font-URL/custom-CSS injection surface, and fix the save hook's own error-message bug that the validation's tests caught.~~
