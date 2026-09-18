import prisma from '@/lib/db';

export interface TenantEcommercePolicy {
  shopifyEnabled: boolean;
  wooCommerceEnabled: boolean;
}

/**
 * Reads tenant settings' ecommerce integration flags (non-secret integration layer).
 * Both flags must be explicitly true to allow **new** OAuth / Woo connect flows.
 */
export async function getTenantEcommerceIntegrationPolicy(tenantId: string): Promise<TenantEcommercePolicy> {
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
    select: { ecommerceShopifyEnabled: true, ecommerceWooCommerceEnabled: true },
  });
  return {
    shopifyEnabled: settings?.ecommerceShopifyEnabled === true,
    wooCommerceEnabled: settings?.ecommerceWooCommerceEnabled === true,
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
