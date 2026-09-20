import type { ITenantSettings } from '@/types/tenant';
import { getDefaultTenantSettings } from '@/lib/currency';
import { supportsFeature } from '@/lib/business-type-helpers';
import { getTenantSettingsById } from '@/lib/tenant';

/**
 * Ensures the tenant has the Kitchen Display System enabled, using the same rules as
 * {@link supportsFeature} for the `kitchenDisplay` feature (tenant flag override +
 * business-type defaults). Mirrors lib/work-order-access.ts.
 */
export async function requireKitchenDisplayAccess(tenantId: string): Promise<void> {
  const raw = await getTenantSettingsById(tenantId);
  const merged = {
    ...getDefaultTenantSettings(),
    ...(raw || {}),
  } as ITenantSettings;

  if (!supportsFeature(merged, 'kitchenDisplay')) {
    throw new Error(
      'Kitchen Display is turned off for this store. Enable it in Settings → Business Features.'
    );
  }
}
