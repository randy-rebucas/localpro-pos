import { checkFeatureAccess } from '@/lib/subscription';

/** In production, require subscription `customIntegrations`. Dev/staging allows all tenants. */
export async function requireEcommerceIntegrationFeature(tenantId: string): Promise<void> {
  if (process.env.NODE_ENV !== 'production') return;
  await checkFeatureAccess(tenantId, 'customIntegrations');
}
