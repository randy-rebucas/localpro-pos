import { shopifyAdminFetch } from '@/lib/ecommerce/shopify-api';
import { shopifySetInventoryLevel } from '@/lib/ecommerce/shopify-catalog';
import type { IProduct } from '@/models/Product';

interface ShopifyVariantResponse {
  id: number;
  inventory_item_id: number;
}

interface ShopifyProductResponse {
  id: number;
  variants: ShopifyVariantResponse[];
}

export async function shopifyCreateProduct(
  shopDomain: string,
  accessToken: string,
  product: IProduct
): Promise<{ externalProductId: string; externalVariantId: string; inventoryItemId: string }> {
  const data = await shopifyAdminFetch<{ product: ShopifyProductResponse }>(
    shopDomain,
    accessToken,
    '/products.json',
    {
      method: 'POST',
      body: JSON.stringify({
        product: {
          title: product.name,
          body_html: product.description || '',
          variants: [
            {
              price: String(product.price),
              sku: product.sku || '',
              inventory_management: 'shopify',
              inventory_policy: product.allowOutOfStockSales ? 'continue' : 'deny',
            },
          ],
        },
      }),
    }
  );

  const variant = data.product.variants[0];
  return {
    externalProductId: String(data.product.id),
    externalVariantId: String(variant.id),
    inventoryItemId: String(variant.inventory_item_id),
  };
}

export async function shopifyUpdateProduct(
  shopDomain: string,
  accessToken: string,
  externalProductId: string,
  updates: { title?: string; body_html?: string; price?: number }
): Promise<void> {
  const variantUpdates: Record<string, string> = {};
  if (updates.price !== undefined) variantUpdates.price = String(updates.price);

  await shopifyAdminFetch(shopDomain, accessToken, `/products/${externalProductId}.json`, {
    method: 'PUT',
    body: JSON.stringify({
      product: {
        id: Number(externalProductId),
        ...(updates.title ? { title: updates.title } : {}),
        ...(updates.body_html !== undefined ? { body_html: updates.body_html } : {}),
        ...(updates.price !== undefined ? { variants: [{ price: String(updates.price) }] } : {}),
      },
    }),
  });
}

export async function shopifyPushInitialInventory(
  shopDomain: string,
  accessToken: string,
  locationId: string,
  inventoryItemId: string,
  stock: number
): Promise<void> {
  await shopifySetInventoryLevel(shopDomain, accessToken, locationId, inventoryItemId, stock);
}
