# run-tests

Run the full test suite and interpret results.

## Steps
1. `pnpm run test` — run all tests in `__tests__/`
2. If any test fails, read the failing test file and the source file it tests. Identify the root cause before making changes.
3. After fixing, re-run `pnpm run test` to confirm green.
4. Optionally: `pnpm run test:coverage` to check coverage report.

## Test file locations
- Unit tests: `__tests__/*.test.ts`
- Vitest config: `vitest.config.ts` (node environment, `@` alias resolves to project root)

## Adding a new test
- Place file in `__tests__/` as `<name>.test.ts`
- Import from `@/lib/...` or `@/models/...` using the `@` alias
- Set `process.env.*` vars at the top of the file before imports (see `__tests__/auth.test.ts` pattern)
- Mock external services (MongoDB, JWT) with `vi.mock()`
- Use `describe/it/expect` — globals are enabled in `vitest.config.ts`
