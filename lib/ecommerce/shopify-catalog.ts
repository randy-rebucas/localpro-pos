import { shopifyAdminFetch } from '@/lib/ecommerce/shopify-api';
import type { NormalizedCatalogProduct, NormalizedCatalogVariant } from '@/lib/ecommerce/types';

interface ShopifyImage {
  id: number;
  src?: string | null;
}

interface ShopifyVariant {
  id: number;
  title: string;
  sku: string | null;
  price: string;
  inventory_item_id: number;
  inventory_quantity?: number;
  image_id?: number | null;
}

interface ShopifyProduct {
  id: number;
  title: string;
  image?: ShopifyImage | null;
  images?: ShopifyImage[];
  variants: ShopifyVariant[];
}

function shopifyProductDefaultImageSrc(p: ShopifyProduct): string | null {
  const fromFeatured = p.image?.src?.trim();
  if (fromFeatured) return fromFeatured;
  const first = p.images?.find((img) => img.src?.trim())?.src?.trim();
  return first || null;
}

function shopifyVariantImageSrc(p: ShopifyProduct, v: ShopifyVariant, productDefault: string | null): string | null {
  const images = p.images || [];
  const byId = new Map<number, string>();
  for (const img of images) {
    const s = img.src?.trim();
    if (s) byId.set(img.id, s);
  }
  if (v.image_id != null && byId.has(v.image_id)) {
    return byId.get(v.image_id)!;
  }
  return productDefault;
}

export async function shopifyFetchAllCatalogProducts(
  shopDomain: string,
  accessToken: string,
  maxPages = 15
): Promise<NormalizedCatalogProduct[]> {
  const out: NormalizedCatalogProduct[] = [];
  let pageInfo: string | undefined;
  let page = 0;

  while (page < maxPages) {
    const query: Record<string, string> = { limit: '250' };
    if (pageInfo) {
      query.page_info = pageInfo;
    } else {
      query.status = 'active';
    }

    const path = `/products.json`;
    const base = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const { SHOPIFY_API_VERSION } = await import('@/lib/ecommerce/constants');
    const url = new URL(
      `https://${base}/admin/api/${SHOPIFY_API_VERSION}${path}`
    );
    Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));

    const res = await fetch(url.toString(), {
      headers: { 'X-Shopify-Access-Token': accessToken },
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Shopify products ${res.status}: ${t.slice(0, 200)}`);
    }
    const link = res.headers.get('link');
    const data = (await res.json()) as { products: ShopifyProduct[] };
    for (const p of data.products || []) {
      const productDefault = shopifyProductDefaultImageSrc(p);
      const variants: NormalizedCatalogVariant[] = (p.variants || []).map((v) => {
        const imageUrl = shopifyVariantImageSrc(p, v, productDefault);
        return {
          externalProductId: String(p.id),
          externalVariantId: String(v.id),
          title: `${p.title} — ${v.title}`.replace(/\s+—\s+Default Title\s*$/, ''),
          sku: v.sku || null,
          price: parseFloat(v.price) || 0,
          inventoryQuantity: typeof v.inventory_quantity === 'number' ? v.inventory_quantity : null,
          inventoryItemId: String(v.inventory_item_id),
          imageUrl: imageUrl || null,
        };
      });
      out.push({
        externalProductId: String(p.id),
        title: p.title,
        imageUrl: productDefault,
        variants,
      });
    }

    page += 1;
    pageInfo = undefined;
    if (link) {
      const m = link.match(/<[^>]+page_info=([^>&>]+)[^>]*>;\s*rel="next"/);
      if (m) {
        pageInfo = decodeURIComponent(m[1]);
        continue;
      }
    }
    if (!data.products?.length) break;
    if (!pageInfo && (!data.products || data.products.length < 250)) break;
  }

  return out;
}

export async function shopifySetInventoryLevel(
  shopDomain: string,
  accessToken: string,
  locationId: string,
  inventoryItemId: string,
  available: number
): Promise<void> {
  await shopifyAdminFetch(shopDomain, accessToken, '/inventory_levels/set.json', {
    method: 'POST',
    body: JSON.stringify({
      location_id: Number(locationId),
      inventory_item_id: Number(inventoryItemId),
      available: Math.max(0, Math.floor(available)),
    }),
  });
}
