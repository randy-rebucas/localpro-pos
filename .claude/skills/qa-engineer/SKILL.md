# qa-engineer

Audit a changed feature slice (page/component + hook + API route + tests) like a QA engineer, not a code reviewer: verify behavior against what the user actually experiences, find untested edge cases, and check the project's known incident classes before signing off. Produces a QA analysis doc under `docs/qa/` in the same format as `docs/qa/admin-settings-qa-analysis.md`.

Use this when: reviewing a diff/PR before merge, auditing an existing page for test gaps, investigating a bug report, or when the user asks "is this well tested" / "what could break" / "QA this."

Complements, doesn't replace, [[workflow-integrity]] (multi-write atomicity/wiring) and [[project_tenant_isolation_audit]]-style checks — pull those in when the slice touches a multi-write route or a permission/setting gate.

## Process

Run every invocation as these phases — don't jump straight to writing tests:

1. **Map the slice** — read every file in the feature fully (page/component, hook, API route(s), existing test file). Identify: what permission/role gates it (`lib/permissions.ts` floor via `roleAtLeast`), what it reads/writes, what other pages/consumers share the same hook, API route, or setting.
2. **Trace data shape end-to-end** — don't assume the client's read shape matches the API's actual response shape. Compare the Prisma model / route response against what the component destructures. This project has shipped a real bug from this exact mismatch (nested `address` object assumed on the client, flat DB columns on the server — see `docs/qa/admin-settings-qa-analysis.md` §2a) — always re-derive this, don't trust that a prior pass already checked it.
3. **Run the checklist** (`references/qa-checklist.md`) against the slice — permissions, validation parity (client vs server), tenant isolation, data integrity, i18n, accessibility, regression triggers.
4. **Execute what's runnable** — run the existing test file (`npx vitest run <file>`), run `pnpm lint` / `tsc --noEmit` on touched files, and manually trace at least one full read/write round trip in the code (not just in a mock).
5. **Write the report** using `references/qa-report-template.md`, ranking findings Critical/High/Medium/Low, marking each fixed/open, and listing a suggested test matrix with `[x]`/`[ ]` for automated vs. manual/integration-only cases.
6. **Fix or flag** — for Critical/High findings that are plain bugs (not product decisions), fix them and add a regression test. For anything that's a product/design call (e.g. "should this be one page or two"), leave it open and say so explicitly rather than guessing.

## Project-specific checks (always run these)

- **Vitest mock safety**: grep any new/edited test file for `.then` on a mock object (`fetch = vi.fn(...).then` or similar). Never attach `.then` to a plain mock — Vitest treats it as a thenable and the run hangs/OOMs. Use `mockResolvedValue`/`mockImplementation` instead. This has caused real OOM failures in this repo; treat any hit as a blocking finding, not a style nit.
- **API route boilerplate order** (from CLAUDE.md): rate limit → `requireAuth`/`requireTenantAccess` → Prisma scoped by `tenantId` → audit log → `handleApiError`. Flag any route missing a step or reordering it, especially a missing `tenantId` filter — cross-tenant leaks are this codebase's documented worst-case failure (subscriptions endpoints, see [[project_tenant_isolation_audit]]).
- **Role/permission floor semantics**: `roleAtLeast(role, floor)` / `hasTenantPermission` are hierarchical floors, not exact-match — a test asserting "only `manager` can X" is wrong if `owner` should also pass. Verify tests check the floor, not a single role.
- **Win8/Metro regression** (only for `app/super-admin/**`): flat design system, no rounded corners/shadows/gradients. Don't just grep for `rounded-`/`shadow-` — read the full file, since the class can be constructed conditionally or live in a shared component.
- **Multi-tenant isolation**: any route/hook touched should be checked against a second tenant's data — either an existing integration test does this, or flag it as an open `[ ]` item in the test matrix (component tests with mocked `fetch` can't prove this; say so).

## Verify
`pnpm lint`, `pnpm build` or `tsc --noEmit` on touched files, and `npx vitest run <test-file>` for the slice's test file. If a finding is behavioral (race, validation gap, data-shape mismatch), don't report done on type-check alone — either add a failing-then-passing regression test or manually trace the round trip and say so in the report.

## Output
A markdown file at `docs/qa/<slice-name>-qa-analysis.md` following `references/qa-report-template.md`. If one already exists for this slice, update it in place (same pattern as CLAUDE.md's "update docs/ when a feature changes") rather than creating a duplicate.
