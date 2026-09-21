# QA Analysis — Multi-Currency Management (tenant admin)

**Component under test:** `app/[tenant]/[lang]/admin/multi-currency/page.tsx`
**Backing API:** `app/api/tenants/[slug]/settings/route.ts` (`GET`, `PUT` — shared with every other settings tab) + `app/api/tenants/[slug]/exchange-rates/route.ts` (`GET`, `POST` — dedicated, since rates live in their own `TenantExchangeRate` table)
**Permission gate:** `settings.manage` (default floor: `manager`) via `usePermissions()`/`canAccess` client-side (disables the whole `<fieldset>` and hides Save) and `hasTenantPermission(...)` server-side on both routes
**Existing test coverage:** none before this pass — added `__tests__/multi-currency-page.test.tsx` (9 tests) and 3 regression tests to `__tests__/tenant-settings-api.test.ts`
**Status:** Audited 2026-09-21. Found and fixed three same-day Critical-severity bugs: (1) a secret API key returned in full by an intentionally-unauthenticated endpoint; (2) the page's core settings (enabled, display currencies, source, API key) silently reverting to hardcoded defaults on every load — the exact nested/flat shape mismatch this codebase has already hit once before (`address`, see `docs/qa/admin-settings-qa-analysis.md`); (3) manually-entered exchange rates being silently discarded on save with a false "saved successfully" message. All three were plain bugs, not product decisions, and are fixed with regression tests. No open findings above Low.

---

## 1. Where it's wired in

| Layer | File | Role |
|---|---|---|
| Page | `app/[tenant]/[lang]/admin/multi-currency/page.tsx` | Renders source/API-key config, per-currency rate inputs, Save |
| Settings fetch/save | `hooks/useMultiCurrencySettings.ts` → `/api/tenants/{tenant}/settings` | Loads/saves `enabled`, `displayCurrencies`, `exchangeRateSource`, `exchangeRateApiKey` — these live as flat scalar columns on `TenantSettings` |
| Rates fetch/save | `hooks/useExchangeRateFetch.ts` → `/api/tenants/{tenant}/exchange-rates` | Loads/saves the actual per-currency rate numbers — these live in a separate `TenantExchangeRate` table, one row per tenant+currency |
| Flatten/unflatten | `lib/tenant-settings-flatten.ts` (write side), `hooks/useMultiCurrencySettings.ts`'s `reshapeMultiCurrency` (new, read side) | `NESTED_FLATTEN_MAP.multiCurrency` maps `enabled`/`displayCurrencies`/`exchangeRateSource`/`exchangeRateApiKey` to flat columns on write; there was no reverse mapping on read until this pass |
| Consumer of the API key | `app/api/tenants/[slug]/exchange-rates/route.ts:121-125` (`fetchExchangeRates(baseCurrency, displayCurrencies, tenant.settings.exchangeRateApiKey)`) | Sends the key to an external exchange-rate provider — confirms it's a real credential, not a display value |

## 2. Functional walkthrough

**Finding 1 — secret leak (Critical, fixed).** `TenantSettings.exchangeRateApiKey` (`prisma/schema.prisma:651`) is a plain nullable string column on the same table `GET /api/tenants/[slug]/settings` returns wholesale (`{ ...tenantSettings, rolePermissionOverrides }`, no field filtering). That GET endpoint is *intentionally* unauthenticated — the route's own comment explains this is how the client discovers its tenant before login, and asserts "no sensitive data exposed." That assertion was false: any unauthenticated caller who knew (or guessed) a tenant slug could read that tenant's configured exchange-rate API key by hitting the endpoint directly, no login required. **Fixed** by excluding the raw key from the GET response entirely and returning `exchangeRateApiKeyConfigured: boolean` instead (`route.ts` GET handler). The PUT handler was also updated so a blank/absent `exchangeRateApiKey` in the request body means "leave unchanged," not "clear the key" — otherwise, since the client can no longer round-trip the real value, every unrelated save from this page (toggling the source, nothing to do with the key) would silently wipe out a previously-configured key. The page's input was switched from `type="text"` to `type="password"` and its placeholder now reflects whether a key is already on file, instead of ever displaying the real value.

**Finding 2 — nested/flat shape mismatch (Critical, fixed).** `ITenantSettings.multiCurrency` (`types/tenant.ts:155`) and this page both expect a nested `settings.multiCurrency.{enabled,displayCurrencies,exchangeRateSource,exchangeRateApiKey}` object. `GET /api/tenants/[slug]/settings` returns the *flat* Prisma row (`multiCurrencyEnabled`, `displayCurrencies`, `exchangeRateSource`, `exchangeRateApiKey` as top-level fields — see `prisma/schema.prisma:648-652`). The old `useMultiCurrencySettings.fetchSettings` did `{ multiCurrency: {defaults...}, ...data.data }` — a shallow spread that never produces a `multiCurrency` key from flat server data, so `settings.multiCurrency` stayed the hardcoded default (`enabled: false`, `displayCurrencies: []`, `exchangeRateSource: 'manual'`) on every single load, regardless of what was actually saved. In practice this meant: multi-currency always appeared disabled, the "no display currencies configured" warning always showed even when currencies were configured, and the exchange rate source always reset to "Manual Entry" in the UI even if "Automatic (API)" was saved — the page was, functionally, never able to show its own saved state. This is the identical bug class already fixed once for `address` (`hooks/useSettingsPage.ts`'s `reshapeAddress`, referenced directly in that file's own comment) but never applied here. **Fixed** by adding a matching `reshapeMultiCurrency` function, applied on both `fetchSettings` and `saveSettings`'s response handling (the PUT response is *also* flat, so the same reshape was needed there too, not just on GET).

**Finding 3 — manually-entered rates silently dropped (Critical, fixed).** `lib/tenant-settings-flatten.ts`'s `NESTED_FLATTEN_MAP.multiCurrency` maps `enabled`/`displayCurrencies`/`exchangeRateSource`/`exchangeRateApiKey` — but not `exchangeRates`. Exchange rates are array-shaped (one row per currency in `TenantExchangeRate`), so per that file's own module doc, they're deliberately handled by a dedicated route (`/exchange-rates`), not flattened here. But this page's `handleSave` only ever called `saveSettings` (the general settings PUT) — never the dedicated exchange-rates endpoint. So an admin manually typing rate values into the per-currency inputs, then clicking "Save Settings," got a "saved successfully" message while their rate edits were silently discarded (`flattenSettingsForPrisma`'s nested-key loop looks up `nestedMap['exchangeRates']`, finds nothing, and drops it). Separately, the page never fetched existing rates on load at all (`GET /exchange-rates` was never called), so even correctly-saved rates (via the "Fetch Latest Rates" API path, which *does* persist correctly through the dedicated endpoint) would render as blank inputs on every reload. **Fixed**: `useExchangeRateFetch` gained `loadRates` (GET, called once on mount after settings resolve) and `saveManualRates` (POST `action: 'update'`, called from `handleSave` when the source is `'manual'` and there are rates to persist).

## 3. Findings (bugs / risks), ranked

### Critical
1. **Exchange-rate API key exposed by an unauthenticated endpoint.** See Finding 1 above. **Fixed.**
2. **Multi-currency settings always reverted to hardcoded defaults on load.** See Finding 2 above. **Fixed.**
3. **Manually-entered exchange rates silently discarded on save, with a false success message.** See Finding 3 above. **Fixed.**

### High
None found beyond the above (the three above were assessed as Critical, not High, given #1 is a real credential leak and #2/#3 mean this page's core function — configuring and persisting multi-currency — did not work at all before this pass).

### Medium
4. **`exchangeRates` value can be a Mongoose `Map` per an inline comment in the page** (`// exchangeRates may be a Mongoose Map or a plain object`). This is dead-code defensiveness from a pre-Postgres-migration codepath — the current Prisma-backed `/exchange-rates` GET always returns a plain object (`Record<string, number>`, built via a `for...of` loop over rows in `route.ts:41-44`). Not removed this pass (harmless, and removing dead defensive code wasn't the goal), but worth cleaning up in a follow-up so the code doesn't imply a data shape that can no longer occur.
5. **No numeric validation on manually-typed rate values beyond the HTML `min="0.0001"` hint.** The client parses with `parseFloat` and substitutes `0` for `NaN` (`isNaN(parsed) ? 0 : parsed`), so a rate of literally `0` can be silently saved for a bad input (e.g. typing "abc") rather than rejecting it. The server-side `/exchange-rates` POST *does* validate (`rate <= 0` is rejected, `route.ts:158-165`), so a `0` value would actually get rejected by the server with a 400 — but the client-side substitution means the admin sees their bad input silently become `0` in the field before that rejection surfaces, which is confusing UX. Not fixed this pass (validation-parity gap, not a security/data-integrity issue since the server backstops it).

### Low
6. **Save button has no per-request guard against a double-click** triggering two sequential `saveSettings` + `saveManualRates` calls. Low risk — both endpoints are idempotent upserts, not additive.

## 4. Suggested test matrix

**Permissions**
- [x] Role below `settings.manage`: `<fieldset disabled>` and Save button hidden.
- [x] Role at/above floor: fieldset enabled, Save button present (implicit in every other passing test, which all run with `canManage: true`).
- [ ] Server-side rejection for a sub-manager role on both `/settings` PUT and `/exchange-rates` POST — inspected (`hasTenantPermission(..., 'settings.manage')` on both) and looks correct, but not integration-tested against a real DB/token.
- [ ] Cross-tenant: a user for tenant A cannot read/write tenant B's multi-currency settings or rates. Both routes scope by `tenant.id` correctly on inspection; not integration-tested.

**Data integrity (the core of this pass)**
- [x] Flat GET response correctly reshapes into the nested `multiCurrency` object the page consumes — regression test for Finding 2, asserts the exchange-rate source select and display-currency rows reflect real saved data, not defaults.
- [x] Empty `displayCurrencies` still correctly shows the empty-state banner (distinguishes "reshape works" from "banner just always shows/hides").
- [x] Exchange rates load from the dedicated endpoint on mount and populate the per-currency inputs — regression test for the "load" half of Finding 3.
- [x] Manual-mode save calls the dedicated exchange-rates endpoint with `action: 'update'` — regression test for the "save" half of Finding 3.
- [x] API-mode save does *not* call the exchange-rates endpoint (rates are already persisted by "Fetch Latest Rates" at fetch time; re-POSTing on every settings save would be redundant/wrong).
- [x] `exchangeRateApiKey` never appears in a `GET /api/tenants/[slug]/settings` response, even when one is configured on the tenant — regression test added directly to `__tests__/tenant-settings-api.test.ts` (API-level, not just component-level).
- [x] A blank/omitted `exchangeRateApiKey` in a PUT body does not clear an existing key server-side — regression test added to `__tests__/tenant-settings-api.test.ts`.
- [x] A non-empty `exchangeRateApiKey` in a PUT body does update the stored key — regression test added.

**Save / error handling**
- [x] "Fetch Latest Rates" success applies the returned rates and shows a success message.
- [ ] "Fetch Latest Rates" failure path (provider unavailable, 502 from the server) — not covered this pass; the server-side error path was inspected (`route.ts:127-133`) and returns a clear message, but no component test exercises it.
- [ ] Exchange-rate save failure (e.g. a `0`/negative rate rejected server-side per Medium #5) surfacing correctly in the UI — not covered this pass.

**i18n**
- [x] New/changed strings (`apiKeyConfiguredPlaceholder`) follow the existing `dict?.admin?.*` pattern with an English fallback, matching every other string in the file.
- [ ] Spot-check `es` locale has matching keys — not done this pass.

**Accessibility**
- [x] API key field remains a standard labeled `<input>` (now `type="password"`); label association was already correct pre-fix.
- [ ] Keyboard-only flow through the currency rate list — not exercised; native inputs throughout, low risk.

**Regression triggers**
- [x] No `.then` attached to a mock object anywhere in `multi-currency-page.test.tsx` or the added `tenant-settings-api.test.ts` cases.
- [x] Tenant isolation re-checked for both routes touched — `tenantId`/`user.tenantId` scoping present and correct on inspection.
- [x] Permission check uses floor semantics (`hasTenantPermission`), not exact-match.
- [x] Re-ran the full pre-existing `tenant-settings-api.test.ts` suite after the GET/PUT changes — one assertion needed updating to include the new `exchangeRateApiKeyConfigured` field (expected shape change, not a regression), all 12 tests pass.
- [N/A] Win8/Metro styling — this page lives under `app/[tenant]/[lang]/admin/**`, not `app/super-admin/**`.

## 5. Recommended next steps

1. Consider whether other `TenantSettings` scalar columns might also be secrets that the intentionally-public GET endpoint shouldn't return (this pass only audited `exchangeRateApiKey`, found via this specific page's audit — worth a dedicated pass over the full column list rather than assuming it's the only one).
2. Clean up the dead `instanceof Map` handling for `exchangeRates` in the page component (Medium #4) now that the Prisma-backed route only ever returns a plain object.
3. Tighten client-side rate-value validation so a non-numeric entry doesn't silently coerce to `0` before the server's own validation catches it (Medium #5).
4. Add an integration test (real DB, two tenants + a sub-manager role) proving cross-tenant isolation and the permission floor on both `/settings` and `/exchange-rates`, currently only verified by code inspection.
~~5. Add component test coverage for the multi-currency page (none existed before this audit).~~
~~6. Fix the three Critical bugs found: API-key leak, nested/flat shape mismatch, and silently-dropped manual rate edits.~~
