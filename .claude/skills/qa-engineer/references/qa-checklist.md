# QA Checklist

Work through every section for the slice under audit. Where a section doesn't apply, say so in one line in the report rather than omitting it silently — an omitted section reads as "forgot to check," a stated N/A reads as "checked, doesn't apply."

## Permissions
- [ ] Role below the required floor: gated UI disabled/hidden, action button absent, server independently rejects (never trust client gate alone).
- [ ] Role at/above the floor: full access works.
- [ ] Sidebar/nav visibility matches the same permission the page/route enforces (separate component — check it explicitly, don't assume).
- [ ] Any tenant-scoped permission override (`rolePermissionOverrides` or similar) is honored client-side *and* server-side, not just one.
- [ ] Cross-tenant: a user authenticated for tenant A cannot act on tenant B's resource. If only covered by a mocked-fetch component test, flag as `[ ]` needing a real integration test.

## Validation (client + server, matched pairs)
- [ ] Every client-side validation rule has a matching server-side check — a bypassed/disabled client check must still be rejected server-side.
- [ ] Boundary values tested, not just obviously-invalid ones: min, max, min-1, max+1, empty, exact boundary (e.g. exactly-32-chars, not just 33).
- [ ] Injection-relevant fields (URLs, free text rendered as HTML/attributes) are scheme/pattern-restricted, not just "non-empty."

## Data integrity
- [ ] Client read shape traced against actual API/DB response shape field-by-field — don't assume a nested shape exists just because the write side flattens/nests it. Re-derive this even if a prior QA pass claims to have checked it.
- [ ] Reload-after-save reflects persisted values for every field touched, not just the one field a bug report mentioned.
- [ ] Partial-save / per-section save (if the UI scopes saves) doesn't let a stale read of an untouched section overwrite concurrent edits.
- [ ] Self-healing / default-row creation paths (if any) produce sane defaults, not nulls that crash a consumer.

## Unsaved-state / concurrency UX
- [ ] Switching away from a dirty form warns before discarding.
- [ ] Concurrent edits from two sessions don't silently clobber each other (flag as integration-test-only if not provable via a mocked unit test).

## i18n
- [ ] Every user-facing string goes through the translation layer, not a hardcoded literal — check both success and error/validation messages.
- [ ] Non-English locale has matching keys (spot-check one non-default locale file) so nothing silently falls back.

## Accessibility
- [ ] Keyboard-only navigation reaches every interactive element in the flow.
- [ ] Custom controls (toggles, tabs) expose accessible labels/roles, not just visual state.
- [ ] Loading/disabled states are conveyed to assistive tech, not just via CSS.

## Regression triggers (this codebase's known incident classes)
- [ ] Tenant isolation re-checked for this specific endpoint/table, given the documented cross-tenant leak history (subscriptions).
- [ ] Role/permission check uses the floor semantics (`roleAtLeast`), not an exact-match comparison.
- [ ] No `.then` attached to a mock object anywhere in the touched test file(s).
- [ ] If touching `app/super-admin/**`: styling still matches the Win8/Metro flat design system (full file read, not a grep for `rounded-`/`shadow-`).
