import type { ITenantSettings } from '@/types/tenant';
import { getDefaultTenantSettings } from '@/lib/currency';
import { supportsFeature } from '@/lib/business-type-helpers';
import { getTenantSettingsById } from '@/lib/tenant';

/**
 * Ensures the tenant has Expenses enabled, using the same rules as
 * {@link supportsFeature} for the `expenses` feature (tenant flag
 * override + business-type defaults). Mirrors lib/table-management-access.ts.
 */
export async function requireExpensesAccess(tenantId: string): Promise<void> {
  const raw = await getTenantSettingsById(tenantId);
  const merged = {
    ...getDefaultTenantSettings(),
    ...(raw || {}),
  } as ITenantSettings;

  if (!supportsFeature(merged, 'expenses')) {
    throw new Error(
      'Expenses is turned off for this store. Enable it under Settings → Feature Flags.'
    );
  }
}
