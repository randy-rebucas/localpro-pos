import type { EcommerceProvider } from '@/lib/ecommerce/constants';

export interface NormalizedCatalogVariant {
  externalProductId: string;
  externalVariantId: string;
  title: string;
  sku: string | null;
  price: number;
  /** Available quantity on the channel (best effort) */
  inventoryQuantity: number | null;
  inventoryItemId?: string;
  /** Channel CDN URL (Shopify: variant image or product default) */
  imageUrl?: string | null;
}

export interface NormalizedCatalogProduct {
  externalProductId: string;
  title: string;
  /** Featured / first product image when variants share one */
  imageUrl?: string | null;
  variants: NormalizedCatalogVariant[];
}

export interface NormalizedOrderLine {
  externalVariantId: string;
  externalProductId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  sku: string | null;
}

export interface NormalizedPaidOrder {
  provider: EcommerceProvider;
  externalOrderId: string;
  currency: string;
  subtotal: number;
  taxTotal: number;
  total: number;
  lines: NormalizedOrderLine[];
  rawTopic?: string;
}

/** Stored encrypted for Shopify; expiring offline tokens include refresh + expiry. */
export interface ShopifyCredentials {
  accessToken: string;
  refreshToken?: string;
  /** Epoch ms when accessToken should be refreshed (client-side buffer applied in resolver). */
  accessTokenExpiresAtMs?: number;
}

export interface WooCommerceCredentials {
  consumerKey: string;
  consumerSecret: string;
}
