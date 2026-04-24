/**
 * Tenant is considered active unless explicitly disabled.
 * Matches Mongoose `default: true` for documents that never persisted `isActive`
 * (plain `{ isActive: true }` in MongoDB does **not** match a missing field).
 */
export const TENANT_IS_ACTIVE_FILTER = { isActive: { $ne: false } } as const;
