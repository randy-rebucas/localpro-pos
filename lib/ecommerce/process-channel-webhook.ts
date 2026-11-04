import { getRepos } from '@/lib/db';
import { parseShopifyOrderWebhook } from '@/lib/ecommerce/parse-shopify-order';
import { parseShopifyRefundWebhook, type NormalizedRefund } from '@/lib/ecommerce/parse-shopify-refund';
import { parseWooCommerceOrderWebhook } from '@/lib/ecommerce/parse-woo-order';
import { importPaidChannelOrder } from '@/lib/ecommerce/import-channel-order';
import {
  updateStock,
  insertStockMovements,
  STOCK_SNAPSHOT_FIELDS,
  type StockMovementInput,
  type StockProductSnapshot,
} from '@/lib/stock';
import { STOCK_REASON_CHANNEL_REFUND } from '@/lib/ecommerce/constants';
import { logger } from '@/lib/logger';

/**
 * Restock each refunded line. Listings and product snapshots are read in one
 * query each, and the stock movements are inserted in a single write.
 */
async function restockShopifyRefund(tenantId: string, refund: NormalizedRefund): Promise<void> {
  if (!refund.lines.length) return;

  let listingByVariant: Map<string, { productId: { toString(): string } }>;
  let snapshotById: Map<string, StockProductSnapshot>;
  try {
    const listings = await getRepos().channelListings.list(
      tenantId,
      { provider: 'shopify', externalVariantIds: [...new Set(refund.lines.map((l) => l.externalVariantId))] },
      { select: 'externalVariantId productId' }
    );
    listingByVariant = new Map(listings.map((l) => [l.externalVariantId, l]));

    const productIds = [...new Set(listings.map((l) => l.productId))];
    const snapshots = productIds.length
      ? await getRepos().products.list(tenantId, { ids: productIds }, { select: STOCK_SNAPSHOT_FIELDS })
      : [];
    snapshotById = new Map<string, StockProductSnapshot>(snapshots.map((p) => [p._id, p]));
  } catch (err) {
    logger.error('Shopify refund restock failed', { externalOrderId: refund.externalOrderId, err });
    return;
  }

  const movements: StockMovementInput[] = [];
  for (const line of refund.lines) {
    try {
      const listing = listingByVariant.get(line.externalVariantId);
      if (!listing) continue;
      const productId = listing.productId.toString();
      await updateStock(productId, tenantId, line.quantity, 'return', {
        reason: STOCK_REASON_CHANNEL_REFUND,
        notes: `Shopify refund on order ${refund.externalOrderId}`,
        product: snapshotById.get(productId),
        movements,
      });
    } catch (err) {
      logger.error('Shopify refund restock failed', { variantId: line.externalVariantId, err });
    }
  }

  try {
    await insertStockMovements(movements);
  } catch (err) {
    logger.error('Shopify refund stock movement insert failed', {
      externalOrderId: refund.externalOrderId,
      count: movements.length,
      err,
    });
  }
}

export async function handleShopifyWebhook(
  shopDomainHeader: string | null,
  topic: string | null,
  rawBody: string,
  payload: unknown
): Promise<{ status: number; body: string }> {
  const shop = (shopDomainHeader || '').toLowerCase().trim();
  if (!shop) return { status: 401, body: 'missing shop' };

  const integration = await getRepos().ecommerceIntegrations.findActiveByShopDomainAcrossTenants(shop);
  if (!integration) {
    return { status: 404, body: 'unknown shop' };
  }

  const tenantId = integration.tenantId;

  if (topic?.startsWith('orders/')) {
    const order = parseShopifyOrderWebhook(payload);
    if (order) {
      const r = await importPaidChannelOrder(tenantId, order);
      if (!r.ok && !r.duplicate) {
        logger.warn('Shopify order import skipped', { reason: r.reason, tenantId });
      }
    }
  } else if (topic === 'refunds/create') {
    const refund = parseShopifyRefundWebhook(payload);
    if (refund) {
      await restockShopifyRefund(tenantId, refund);
    }
  }

  return { status: 200, body: 'ok' };
}

export async function handleWooCommerceWebhook(
  integrationId: string,
  rawBody: string,
  payload: unknown
): Promise<{ status: number; body: string }> {
  const integration = await getRepos().ecommerceIntegrations.findByIdAcrossTenants(integrationId);
  if (!integration || integration.provider !== 'woocommerce' || !integration.isActive) {
    return { status: 404, body: 'unknown integration' };
  }

  const order = parseWooCommerceOrderWebhook(payload);
  if (order) {
    const r = await importPaidChannelOrder(integration.tenantId, order);
    if (!r.ok && !r.duplicate) {
      logger.warn('Woo order import skipped', { reason: r.reason, integrationId });
    }
  }

  return { status: 200, body: 'ok' };
}
