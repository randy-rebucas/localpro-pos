import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import type { ITenantSettings } from '@/types/tenant';

export interface TenantEcommercePolicy {
  shopifyEnabled: boolean;
  wooCommerceEnabled: boolean;
}

/**
 * Reads tenant settings.integrations.ecommerce (non-secret integration layer).
 * Both flags must be explicitly true to allow **new** OAuth / Woo connect flows.
 */
export async function getTenantEcommerceIntegrationPolicy(tenantId: string): Promise<TenantEcommercePolicy> {
  await connectDB();
  const tenant = await Tenant.findById(tenantId).select('settings.integrations').lean();
  const ec = (tenant?.settings as ITenantSettings | undefined)?.integrations?.ecommerce;
  return {
    shopifyEnabled: ec?.shopifyEnabled === true,
    wooCommerceEnabled: ec?.wooCommerceEnabled === true,
  };
}

export async function requireEcommerceProviderConnectAllowed(
  tenantId: string,
  provider: 'shopify' | 'woocommerce'
): Promise<void> {
  const p = await getTenantEcommerceIntegrationPolicy(tenantId);
  if (provider === 'shopify' && !p.shopifyEnabled) {
    throw new Error(
      'Shopify is not enabled for this store. Open Settings → E-commerce, turn on Shopify under Store integrations, then save if needed and try again.'
    );
  }
  if (provider === 'woocommerce' && !p.wooCommerceEnabled) {
    throw new Error(
      'WooCommerce is not enabled for this store. Open Settings → E-commerce, turn on WooCommerce under Store integrations, then save if needed and try again.'
    );
  }
}
