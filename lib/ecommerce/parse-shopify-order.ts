import type { NormalizedOrderLine, NormalizedPaidOrder } from '@/lib/ecommerce/types';

interface ShopifyLineItem {
  id: number;
  product_id: number | null;
  variant_id: number | null;
  title: string;
  quantity: number;
  price: string;
  sku: string | null;
}

interface ShopifyOrderPayload {
  id: number;
  financial_status?: string;
  currency?: string;
  subtotal_price?: string;
  total_tax?: string;
  total_price?: string;
  line_items?: ShopifyLineItem[];
}

export function parseShopifyOrderWebhook(payload: unknown): NormalizedPaidOrder | null {
  const order = payload as ShopifyOrderPayload;
  if (!order?.id) return null;
  if (order.financial_status !== 'paid') return null;

  const lines: NormalizedOrderLine[] = (order.line_items || [])
    .filter((li) => li.variant_id && li.product_id)
    .map((li) => ({
      externalVariantId: String(li.variant_id),
      externalProductId: String(li.product_id),
      name: li.title,
      quantity: li.quantity,
      unitPrice: parseFloat(li.price) || 0,
      sku: li.sku || null,
    }));

  if (!lines.length) return null;

  return {
    provider: 'shopify',
    externalOrderId: String(order.id),
    currency: order.currency || 'USD',
    subtotal: parseFloat(order.subtotal_price || '0') || 0,
    taxTotal: parseFloat(order.total_tax || '0') || 0,
    total: parseFloat(order.total_price || '0') || 0,
    lines,
  };
}
