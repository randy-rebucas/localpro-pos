# workflow-integrity

Audit or implement a multi-step workflow (checkout, refund, void, shift open/close, stock adjustment, payment capture, loyalty/balance adjustment) — any handler writing to **more than one collection or side effect** — so it can't leave a half-done or double-applied state. Single-collection CRUD only needs [[api_patterns]] (`add-api-route`).

## When
Editing `app/api/{transactions,pos,cash-drawer,stock-movements,inventory,payments,loyalty}` or any route doing 2+ model writes • user reports stock/balance/shift discrepancy or double charge/refund • adding a new multi-write route.

## Checks
1. **Atomicity** — all writes succeed or none do. Prefer a Mongo transaction (`startSession()` + `withTransaction()`, `{ session }` on every write). Prior art: only `prescriptions/[id]/dispense`, `loyalty/adjust`, `customers/[id]/balance-payments` use transactions (`rg "withTransaction|startSession" app/api`) — new multi-write financial/inventory routes should match that, not the untransacted majority. No transaction + no compensating rollback on a multi-write financial/inventory route = flag it, even if "unlikely to fail."
2. **Idempotency** — can a retry/double-tap/back-button resubmit double-apply? Needs a dedupe key (client idempotency token or unique index) turning a repeat into a no-op/409. Payment capture/refund are highest risk.
3. **Concurrency** — flag `findOne` → compute → `save()` on stock/balance/points (two concurrent sales can oversell). Prefer atomic `findOneAndUpdate` with `$inc` + a precondition filter (e.g. `{ stock: { $gte: qty } }`).
4. **State machine** — status transitions (pending→completed→refunded, open→closed, pending→dispensed) must be validated server-side before mutating, not just set.
5. **Tenant + audit** — every write shares `tenantId`; one audit log per meaningful state change, not just the first write. See [[project_tenant_isolation_audit]], [[auth_system]], [[project_role_permission_audit]].

## Output
Per file: writes involved → atomicity → idempotency → concurrency → state machine → tenant/audit. Flag only plausible concrete failure scenarios (same bar as [[project_tenant_isolation_audit]]/[[project_role_permission_audit]]: full file read, no grep-only pass, no hedging).

## Verify
`pnpm run lint` && `pnpm run build`; add a test via `test-writer` if a race/idempotency fix has no coverage.
