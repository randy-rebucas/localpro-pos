import type { ITenantSettings } from '@/types/tenant';
import { getDefaultTenantSettings } from '@/lib/currency';
import { supportsFeature } from '@/lib/business-type-helpers';
import { getTenantSettingsById } from '@/lib/tenant';

/**
 * Ensures the tenant has Table Management enabled, using the same rules as
 * {@link supportsFeature} for the `tableManagement` feature (tenant flag
 * override + business-type defaults). Mirrors lib/work-order-access.ts.
 */
export async function requireTableManagementAccess(tenantId: string): Promise<void> {
  const raw = await getTenantSettingsById(tenantId);
  const merged = {
    ...getDefaultTenantSettings(),
    ...(raw || {}),
  } as ITenantSettings;

  if (!supportsFeature(merged, 'tableManagement')) {
    throw new Error(
      'Table management is turned off for this store. Enable it under Settings → Feature Flags.'
    );
  }
}
