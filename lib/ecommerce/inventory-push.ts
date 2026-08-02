import prisma from '@/lib/prisma';
import { getProductStock } from '@/lib/stock';
import { getWooCommerceCredentials } from '@/lib/ecommerce/integration-credentials';
import { getShopifyAccessTokenForIntegration } from '@/lib/ecommerce/shopify-token';
import { shopifySetInventoryLevel } from '@/lib/ecommerce/shopify-catalog';
import { wooSetProductStock } from '@/lib/ecommerce/woocommerce-catalog';
import { STOCK_REASON_CHANNEL_SALE, STOCK_REASON_CHANNEL_REFUND } from '@/lib/ecommerce/constants';
import { logger } from '@/lib/logger';

/** Reasons that indicate stock change already reflected on the storefront — do not push. */
const SKIP_PUSH_REASONS = new Set([STOCK_REASON_CHANNEL_SALE, STOCK_REASON_CHANNEL_REFUND]);

export function shouldSkipOutboundChannelPush(stockReason?: string): boolean {
  if (!stockReason) return false;
  return SKIP_PUSH_REASONS.has(stockReason);
}

/**
 * After a POS-side stock change, push absolute available quantity to all linked storefronts.
 */
export async function pushChannelInventoryForProduct(
  tenantId: string,
  productId: string,
  options?: { branchId?: string; variation?: { size?: string; color?: string; type?: string }; stockReason?: string }
): Promise<void> {
  if (shouldSkipOutboundChannelPush(options?.stockReason)) return;

  const listings = await prisma.productChannelListing.findMany({ where: { tenantId, productId } });
  if (!listings.length) return;

  const integrations = await prisma.tenantEcommerceIntegration.findMany({
    where: { tenantId, isActive: true, provider: { in: ['shopify', 'woocommerce'] } },
  });

  const byProvider = new Map(integrations.map((i) => [i.provider, i]));

  for (const list of listings) {
    const integration = byProvider.get(list.provider) as (typeof integrations)[0] | undefined;
    if (!integration) continue;

    try {
      const variation = list.variation as { size?: string; color?: string; type?: string } | null;
      const available = await getProductStock(productId, tenantId, {
        branchId: integration.defaultBranchId || options?.branchId,
        variation: variation || options?.variation,
      });

      if (list.provider === 'shopify') {
        const loc = integration.shopifyLocationId;
        if (!loc || !list.inventoryItemId || !integration.shopDomain) {
          logger.warn('Shopify push skipped: missing location or inventoryItemId', { productId });
          continue;
        }
        const accessToken = await getShopifyAccessTokenForIntegration({ _id: integration.id, credentialsEncrypted: integration.credentialsEncrypted, shopDomain: integration.shopDomain });
        await shopifySetInventoryLevel(
          integration.shopDomain,
          accessToken,
          loc,
          list.inventoryItemId,
          available
        );
      } else if (list.provider === 'woocommerce') {
        const cred = getWooCommerceCredentials(integration as Parameters<typeof getWooCommerceCredentials>[0]);
        if (!integration.siteUrl) continue;
        await wooSetProductStock(
          integration.siteUrl,
          cred.consumerKey,
          cred.consumerSecret,
          list.externalProductId,
          list.externalVariantId,
          available
        );
      }
    } catch (e) {
      logger.error('pushChannelInventoryForProduct failed', { productId, provider: list.provider, err: e });
    }
  }
}

export async function pushChannelInventoryForProducts(
  tenantId: string,
  productIds: string[],
  options?: { branchId?: string; stockReason?: string }
): Promise<void> {
  const unique = [...new Set(productIds.filter(Boolean))];
  await Promise.all(unique.map((id) => pushChannelInventoryForProduct(tenantId, id, options)));
}
