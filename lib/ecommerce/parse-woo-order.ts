import type { NormalizedOrderLine, NormalizedPaidOrder } from '@/lib/ecommerce/types';

interface WooLineItem {
  id: number;
  product_id: number;
  variation_id?: number;
  name: string;
  quantity: number;
  price: number | string;
  sku?: string;
}

interface WooOrderPayload {
  id: number;
  status?: string;
  currency?: string;
  total?: string;
  subtotal?: string;
  total_tax?: string;
  line_items?: WooLineItem[];
}

const PAID_STATUSES = new Set(['processing', 'completed']);

export function parseWooCommerceOrderWebhook(payload: unknown): NormalizedPaidOrder | null {
  const order = payload as WooOrderPayload;
  if (!order?.id) return null;
  if (!order.status || !PAID_STATUSES.has(order.status)) return null;

  const lines: NormalizedOrderLine[] = (order.line_items || []).map((li) => {
    const variantId = li.variation_id && li.variation_id > 0 ? li.variation_id : li.product_id;
    return {
      externalVariantId: String(variantId),
      externalProductId: String(li.product_id),
      name: li.name,
      quantity: li.quantity,
      unitPrice: typeof li.price === 'number' ? li.price : parseFloat(String(li.price)) || 0,
      sku: li.sku || null,
    };
  });

  if (!lines.length) return null;

  return {
    provider: 'woocommerce',
    externalOrderId: String(order.id),
    currency: order.currency || 'USD',
    subtotal: parseFloat(order.subtotal || '0') || 0,
    taxTotal: parseFloat(order.total_tax || '0') || 0,
    total: parseFloat(order.total || '0') || 0,
    lines,
  };
}
