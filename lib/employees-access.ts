import type { ITenantSettings } from '@/types/tenant';
import { getDefaultTenantSettings } from '@/lib/currency';
import { supportsFeature } from '@/lib/business-type-helpers';
import { getTenantSettingsById } from '@/lib/tenant';

/**
 * Ensures the tenant has Employees (staff account management) enabled, using
 * the same rules as {@link supportsFeature} for the `employees` feature
 * (tenant flag override + business-type defaults). Mirrors
 * lib/table-management-access.ts. Only gates creating new staff accounts —
 * listing/viewing existing users stays available so an owner can still see
 * and deactivate accounts after turning this off.
 */
export async function requireEmployeesAccess(tenantId: string): Promise<void> {
  const raw = await getTenantSettingsById(tenantId);
  const merged = {
    ...getDefaultTenantSettings(),
    ...(raw || {}),
  } as ITenantSettings;

  if (!supportsFeature(merged, 'employees')) {
    throw new Error(
      'Employee management is turned off for this store. Enable it under Settings → Feature Flags.'
    );
  }
}
