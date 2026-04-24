/** Stock movement / updateStock reason: online channel sale (inbound webhook) — outbound channel push must ignore. */
export const STOCK_REASON_CHANNEL_SALE = 'channel_sale';

/** Stock movement reason: channel-driven refund / restock */
export const STOCK_REASON_CHANNEL_REFUND = 'channel_refund';

export type EcommerceProvider = 'shopify' | 'woocommerce';

export const SHOPIFY_API_VERSION = '2024-07';
