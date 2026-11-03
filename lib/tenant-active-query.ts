import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';

/**
 * Tenant is considered active unless explicitly disabled.
 * Matches Mongoose `default: true` for documents that never persisted `isActive`
 * (plain `{ isActive: true }` in MongoDB does **not** match a missing field).
 */
export const TENANT_IS_ACTIVE_FILTER = { isActive: { $ne: false } } as const;

export interface ActiveTenant {
  _id: { toString(): string };
  slug: string;
  name: string;
  settings?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Active tenants for cron automations. Tenant documents are large (settings,
 * templates, holidays…), so callers name the fields they need:
 *   getActiveTenants('settings.timezone settings.email')
 * `_id slug name` are always included.
 */
export async function getActiveTenants(fields = ''): Promise<ActiveTenant[]> {
  await connectDB();
  return Tenant.find(TENANT_IS_ACTIVE_FILTER)
    .select(`_id slug name ${fields}`.trim())
    .lean<ActiveTenant[]>();
}
