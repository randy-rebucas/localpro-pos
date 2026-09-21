import type { ITenantSettings } from '@/types/tenant';
import { getDefaultTenantSettings } from '@/lib/currency';
import { supportsFeature } from '@/lib/business-type-helpers';
import { getTenantSettingsById } from '@/lib/tenant';

/**
 * Ensures the tenant has Categories enabled, using the same rules as
 * {@link supportsFeature} for the `categories` feature (tenant flag
 * override + business-type defaults). Mirrors lib/table-management-access.ts.
 */
export async function requireCategoriesAccess(tenantId: string): Promise<void> {
  const raw = await getTenantSettingsById(tenantId);
  const merged = {
    ...getDefaultTenantSettings(),
    ...(raw || {}),
  } as ITenantSettings;

  if (!supportsFeature(merged, 'categories')) {
    throw new Error(
      'Categories are turned off for this store. Enable it under Settings → Feature Flags.'
    );
  }
}
