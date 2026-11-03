import connectDB from '@/lib/mongodb';
import ProductChannelListing from '@/models/ProductChannelListing';
import TenantEcommerceIntegration from '@/models/TenantEcommerceIntegration';
import Product from '@/models/Product';
import { computeProductStock, STOCK_SNAPSHOT_FIELDS, type StockProductSnapshot } from '@/lib/stock';
import { getWooCommerceCredentials } from '@/lib/ecommerce/integration-credentials';
import { getShopifyAccessTokenForIntegration } from '@/lib/ecommerce/shopify-token';
import { shopifySetInventoryLevel } from '@/lib/ecommerce/shopify-catalog';
import { wooSetProductStock } from '@/lib/ecommerce/woocommerce-catalog';
import { STOCK_REASON_CHANNEL_SALE, STOCK_REASON_CHANNEL_REFUND } from '@/lib/ecommerce/constants';
import { logger } from '@/lib/logger';
import { cacheWrap, CacheKeys, TTL } from '@/lib/cache';

/** Reasons that indicate stock change already reflected on the storefront — do not push. */
const SKIP_PUSH_REASONS = new Set([STOCK_REASON_CHANNEL_SALE, STOCK_REASON_CHANNEL_REFUND]);

export function shouldSkipOutboundChannelPush(stockReason?: string): boolean {
  if (!stockReason) return false;
  return SKIP_PUSH_REASONS.has(stockReason);
}

type VariationOption = { size?: string; color?: string; type?: string };
type PushOptions = { branchId?: string; variation?: VariationOption; stockReason?: string };

/**
 * After a POS-side stock change, push absolute available quantity to all linked storefronts.
 */
export async function pushChannelInventoryForProduct(
  tenantId: string,
  productId: string,
  options?: PushOptions
): Promise<void> {
  await pushChannelInventoryForProducts(tenantId, [productId], options);
}

/**
 * Batch version: one listings read, one integrations read and one product
 * snapshot read for all products, then stock is computed in memory.
 */
export async function pushChannelInventoryForProducts(
  tenantId: string,
  productIds: string[],
  options?: PushOptions
): Promise<void> {
  if (shouldSkipOutboundChannelPush(options?.stockReason)) return;
  const unique = [...new Set(productIds.filter(Boolean))];
  if (!unique.length) return;

  // Runs after every POS sale — most tenants have no storefront linked, so skip
  // the listing/integration lookups entirely for them (cached 60s).
  await connectDB();
  const hasIntegrations = await cacheWrap(CacheKeys.tenantHasIntegrations(tenantId), TTL.DEFAULT, async () =>
    Boolean(await TenantEcommerceIntegration.exists({ tenantId, isActive: true }))
  );
  if (!hasIntegrations) return;

  const listings = await ProductChannelListing.find({ tenantId, productId: { $in: unique } }).lean();
  if (!listings.length) return;

  const [integrations, products] = await Promise.all([
    TenantEcommerceIntegration.find({
      tenantId,
      isActive: true,
      provider: { $in: ['shopify', 'woocommerce'] },
    }).lean(),
    Product.find({ _id: { $in: [...new Set(listings.map((l) => l.productId.toString()))] }, tenantId })
      .select(STOCK_SNAPSHOT_FIELDS)
      .lean<(StockProductSnapshot & { _id: { toString(): string } })[]>(),
  ]);

  const byProvider = new Map(integrations.map((i) => [i.provider, i]));
  const productById = new Map(products.map((p) => [p._id.toString(), p]));

  // Group listings per product: products are pushed in parallel, a product's
  // listings sequentially (same concurrency as the former per-product calls)
  const listingsByProduct = new Map<string, typeof listings>();
  for (const list of listings) {
    const pid = list.productId.toString();
    const group = listingsByProduct.get(pid);
    if (group) group.push(list);
    else listingsByProduct.set(pid, [list]);
  }

  await Promise.all(
    [...listingsByProduct].map(async ([productId, productListings]) => {
      for (const list of productListings) {
        const integration = byProvider.get(list.provider) as (typeof integrations)[0] | undefined;
        if (!integration) continue;

        try {
          const product = productById.get(productId);
          if (!product) throw new Error('Product not found');
          const available = computeProductStock(product, {
            branchId: integration.defaultBranchId?.toString() || options?.branchId,
            variation: list.variation || options?.variation,
          });

          if (list.provider === 'shopify') {
            const loc = integration.shopifyLocationId;
            if (!loc || !list.inventoryItemId || !integration.shopDomain) {
              logger.warn('Shopify push skipped: missing location or inventoryItemId', { productId });
              continue;
            }
            const accessToken = await getShopifyAccessTokenForIntegration(integration);
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
    })
  );
}
