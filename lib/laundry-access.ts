import type { ITenantSettings } from '@/types/tenant';
import { getDefaultTenantSettings } from '@/lib/currency';
import { supportsFeature } from '@/lib/business-type-helpers';
import { getTenantSettingsById } from '@/lib/tenant';

/**
 * Ensures the tenant has Laundry Orders enabled, using the same rules as
 * {@link supportsFeature} for the `laundryOrders` feature (tenant flag override +
 * business-type defaults). Mirrors lib/work-order-access.ts / lib/delivery-access.ts.
 */
export async function requireLaundryOrderAccess(tenantId: string): Promise<void> {
  const raw = await getTenantSettingsById(tenantId);
  const merged = {
    ...getDefaultTenantSettings(),
    ...(raw || {}),
  } as ITenantSettings;

  if (!supportsFeature(merged, 'laundryOrders')) {
    throw new Error(
      'Laundry Orders is turned off for this store. Enable it in Settings → Business Features.'
    );
  }
}
