import { shopifyAdminFetch } from '@/lib/ecommerce/shopify-api';
import ProductChannelListing from '@/models/ProductChannelListing';
import { logger } from '@/lib/logger';

interface RefundItem {
  productId: string;
  quantity: number;
}

interface ShopifyOrderLine {
  id: number;
  variant_id: number | null;
  quantity: number;
}

/**
 * Refunds a Shopify order after a POS-side refund is committed.
 * Matches POS product IDs → Shopify variant IDs → order line item IDs.
 * Fire-and-forget; never throws (failures are logged).
 */
export async function createShopifyRefund(
  shopDomain: string,
  accessToken: string,
  tenantId: string,
  shopifyOrderId: string,
  items: RefundItem[],
  amount: number
): Promise<void> {
  try {
    // Fetch Shopify order to get line item IDs
    const orderData = await shopifyAdminFetch<{ order: { line_items: ShopifyOrderLine[]; currency: string } }>(
      shopDomain,
      accessToken,
      `/orders/${shopifyOrderId}.json`,
      { query: { fields: 'line_items,currency' } }
    );

    const shopifyLines = orderData.order.line_items;
    const currency = orderData.order.currency;

    // Build variantId → lineItemId map
    const variantToLineId = new Map<string, number>();
    for (const l of shopifyLines) {
      if (l.variant_id) variantToLineId.set(String(l.variant_id), l.id);
    }

    // Look up our listings to get externalVariantId per productId
    const productIds = items.map((i) => i.productId);
    const listings = await ProductChannelListing.find({
      tenantId,
      productId: { $in: productIds },
      provider: 'shopify',
    }).lean();

    const productToVariant = new Map<string, string>();
    for (const l of listings) {
      if (l.externalVariantId) productToVariant.set(l.productId.toString(), l.externalVariantId);
    }

    const refundLineItems = [];
    for (const item of items) {
      const variantId = productToVariant.get(item.productId);
      if (!variantId) continue;
      const lineItemId = variantToLineId.get(variantId);
      if (!lineItemId) continue;
      refundLineItems.push({
        line_item_id: lineItemId,
        quantity: item.quantity,
        restock_type: 'no_restock',
      });
    }

    await shopifyAdminFetch(shopDomain, accessToken, `/orders/${shopifyOrderId}/refunds.json`, {
      method: 'POST',
      body: JSON.stringify({
        refund: {
          notify: false,
          shipping: { full_refund: false },
          refund_line_items: refundLineItems,
          transactions: [
            {
              kind: 'refund',
              gateway: 'manual',
              amount: amount.toFixed(2),
              currency,
            },
          ],
        },
      }),
    });

    logger.info('createShopifyRefund succeeded', { shopifyOrderId, amount });
  } catch (err) {
    logger.error('createShopifyRefund failed', { shopifyOrderId, err });
  }
}
