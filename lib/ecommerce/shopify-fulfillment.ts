import { shopifyAdminFetch } from '@/lib/ecommerce/shopify-api';

interface FulfillmentOrder {
  id: number;
  status: string;
}

export async function createShopifyFulfillment(
  shopDomain: string,
  accessToken: string,
  shopifyOrderId: string,
  trackingNumber?: string,
  trackingCompany?: string
): Promise<{ fulfillmentId: string }> {
  // Get fulfillment orders (required by Fulfillment Orders API, 2022-07+)
  const foData = await shopifyAdminFetch<{ fulfillment_orders: FulfillmentOrder[] }>(
    shopDomain,
    accessToken,
    `/orders/${shopifyOrderId}/fulfillment_orders.json`
  );

  const openFOs = foData.fulfillment_orders.filter(
    (fo) => fo.status === 'open' || fo.status === 'in_progress'
  );

  if (!openFOs.length) throw new Error('No open fulfillment orders found');

  const payload: Record<string, unknown> = {
    fulfillment: {
      line_items_by_fulfillment_order: openFOs.map((fo) => ({
        fulfillment_order_id: fo.id,
      })),
      notify_customer: true,
    },
  };

  if (trackingNumber || trackingCompany) {
    payload.fulfillment = {
      ...(payload.fulfillment as object),
      tracking_info: {
        ...(trackingNumber ? { number: trackingNumber } : {}),
        ...(trackingCompany ? { company: trackingCompany } : {}),
      },
    };
  }

  const result = await shopifyAdminFetch<{ fulfillment: { id: number } }>(
    shopDomain,
    accessToken,
    '/fulfillments.json',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );

  return { fulfillmentId: String(result.fulfillment.id) };
}
