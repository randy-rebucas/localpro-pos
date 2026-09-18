/**
 * ⚠️ TENANT-ISOLATION CRITICAL FILE ⚠️
 * Shared "is this tenant active" predicate used when composing Prisma `where`
 * clauses that scope by `tenantId`. Never use this in isolation — it must
 * always be combined with an explicit `tenantId` filter by the caller.
 */

/**
 * Tenant is considered active unless explicitly disabled.
 * Matches Mongoose `default: true` for documents that never persisted `isActive`
 * (plain `{ isActive: true }` did **not** match a missing field in MongoDB).
 * In Postgres, `Tenant.isActive` has `@default(true)` and is NOT NULL, so
 * every row always has a concrete boolean — `{ isActive: true }` alone would
 * now be equivalent, but we keep the `not: false` shape for drop-in parity
 * with existing callers and in case the column is ever made nullable.
 */
export const TENANT_IS_ACTIVE_FILTER = { isActive: { not: false } } as const;
