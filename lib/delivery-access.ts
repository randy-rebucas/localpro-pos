import type { ITenantSettings } from '@/types/tenant';
import { getDefaultTenantSettings } from '@/lib/currency';
import { supportsFeature } from '@/lib/business-type-helpers';
import { getTenantSettingsById } from '@/lib/tenant';

/**
 * Ensures the tenant has Pickup & Delivery enabled, using the same rules as
 * {@link supportsFeature} for the `delivery` feature (tenant flag override +
 * business-type defaults). Mirrors lib/booking-scheduling-access.ts.
 */
export async function requireDeliveryAccess(tenantId: string): Promise<void> {
  const raw = await getTenantSettingsById(tenantId);
  const merged = {
    ...getDefaultTenantSettings(),
    ...(raw || {}),
  } as ITenantSettings;

  if (!supportsFeature(merged, 'delivery')) {
    throw new Error(
      'Pickup & Delivery is turned off for this store. Enable it in Settings → Business Features.'
    );
  }
}
