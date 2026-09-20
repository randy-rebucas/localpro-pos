import type { ITenantSettings } from '@/types/tenant';
import { getDefaultTenantSettings } from '@/lib/currency';
import { supportsFeature } from '@/lib/business-type-helpers';
import { getTenantSettingsById } from '@/lib/tenant';

/**
 * Ensures the tenant has Job / Work Orders enabled, using the same rules as
 * {@link supportsFeature} for the `workOrders` feature (tenant flag override +
 * business-type defaults). Mirrors lib/delivery-access.ts.
 */
export async function requireWorkOrderAccess(tenantId: string): Promise<void> {
  const raw = await getTenantSettingsById(tenantId);
  const merged = {
    ...getDefaultTenantSettings(),
    ...(raw || {}),
  } as ITenantSettings;

  if (!supportsFeature(merged, 'workOrders')) {
    throw new Error(
      'Job / Work Orders is turned off for this store. Enable it in Settings → Business Features.'
    );
  }
}
