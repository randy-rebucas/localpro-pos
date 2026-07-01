interface ShopifyRefundLineItem {
  line_item: {
    variant_id: number | null;
    product_id: number | null;
    quantity: number;
  };
  quantity: number;
}

interface ShopifyRefundPayload {
  id: number;
  order_id: number;
  refund_line_items?: ShopifyRefundLineItem[];
}

export interface NormalizedRefundLine {
  externalVariantId: string;
  externalProductId: string;
  quantity: number;
}

export interface NormalizedRefund {
  externalOrderId: string;
  lines: NormalizedRefundLine[];
}

export function parseShopifyRefundWebhook(payload: unknown): NormalizedRefund | null {
  const refund = payload as ShopifyRefundPayload;
  if (!refund?.id || !refund?.order_id) return null;

  const lines: NormalizedRefundLine[] = (refund.refund_line_items || [])
    .filter((rli) => rli.line_item?.variant_id && rli.line_item?.product_id)
    .map((rli) => ({
      externalVariantId: String(rli.line_item.variant_id),
      externalProductId: String(rli.line_item.product_id),
      quantity: rli.quantity,
    }));

  if (!lines.length) return null;

  return {
    externalOrderId: String(refund.order_id),
    lines,
  };
}
