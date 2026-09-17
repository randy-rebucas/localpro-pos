# feature-completeness

Audit or implement a **full feature slice** (a page + its API route(s) + model, e.g. `app/[tenant]/[lang]/admin/devices/page.tsx` + `app/api/devices/*`) end-to-end so it's not just correct in isolation but actually complete, wired up, and usable. Use [[add-api-route]] for a single new route's boilerplate and [[workflow-integrity]] for multi-write financial/inventory atomicity — this skill is the wrapper check that the *whole feature* (UI included) hangs together.

## When
Reviewing or shipping a feature that has both a UI page/component and at least one API route • user reports "X doesn't work" / "X is half-built" / "the button does nothing" • before marking a feature done.

## Checks

1. **Wiring, not just existence** — every UI action (button, form submit, toggle) actually calls an API route that exists and returns the shape the UI expects. Grep the page for `fetch(`/`axios`/API client calls and confirm each target route exists under `app/api/`. Flag dead buttons (`onClick` with no handler, TODO, or handler that only does `console.log`).
2. **CRUD symmetry** — if the page lists/creates/edits/deletes, confirm the matching API verbs exist (`GET`/`POST`/`PUT`or`PATCH`/`DELETE`). A list-only or create-only feature where the UI implies edit/delete (edit icon, delete icon) but no route backs it is incomplete, not "future work."
3. **Loading / empty / error states** — the page must render distinct states for: initial load, empty result set, fetch error, and mutation-in-flight (disabled button / spinner) so a slow network or failed request doesn't look like silent success. Flag `try { await fetch(...) } catch {}` with no user-visible error.
4. **Optimistic vs. actual state** — if the UI updates local state before/without waiting on the API response, confirm it reconciles on failure (rollback) rather than drifting from server truth.
5. **Validation parity** — any client-side validation (required fields, format checks) must be mirrored server-side in the route handler; never trust the client alone. Conversely, don't let the API reject silently — surface its error message in the UI.
6. **Tenant + role gating in the UI, not just the API** — actions restricted server-side (e.g. `owner`+ only) should also be hidden/disabled client-side using the current user's role (`roleAtLeast`), not just fail with a 403 after the click. See [[auth_system]], [[project_role_permission_audit]].
7. **API boilerplate compliance** — every route touched follows the standard order (rate limit → auth → DB connect → `tenantId` scoping → audit log → `handleApiError`). See [[api_patterns]]. For super-admin-only routes, confirm the `role !== 'super_admin'` guard per [[add-api-route]].
8. **Model/schema alignment** — fields the UI reads or writes must exist on the Mongoose schema with matching types/enums; flag UI fields with no schema backing (silently dropped on save) or schema fields no UI ever surfaces (dead data).
9. **i18n** — all user-facing strings (labels, errors, toasts, empty states) go through the translation layer, not hardcoded English, consistent with [[workflow-integrity]]'s check #6 (`lib/validation-translations.ts` server-side; the page's i18n helper client-side). Path is `[tenant]/[lang]/...` — a hardcoded string breaks every non-default `lang`.
10. **Styling consistency** — if the page is under `app/super-admin/`, it must match the Win8/Metro flat design system, not the tenant-facing app's look. See [[win8_admin_styling]], [[feedback_always_fix_buttons]].
11. **Test coverage** — is there a test for the route(s) under `__tests__/`? A feature with a non-trivial permission check, validation rule, or state transition and zero test coverage is a gap to flag, not silently accept.
12. **Docs** — per `.github/copilot-instructions.md`, `docs/` should be updated when a feature changes; flag if the feature clearly needs a doc update and none exists.

## Output
Per feature: wiring → CRUD symmetry → UI states → validation parity → role gating → API boilerplate → schema alignment → i18n → styling (if super-admin) → test coverage → docs. Flag only concrete, plausible gaps you actually verified by reading the files — no grep-only pass, no hedging. Read the full page component and every route file it calls before reporting.

## Verify
`pnpm run lint` && `pnpm run build`; run the specific test file if one exists, or hand off to `test-writer` if a validated gap has no coverage.
