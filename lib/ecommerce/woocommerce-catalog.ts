import { wooFetchJson } from '@/lib/ecommerce/woocommerce-api';
import type { NormalizedCatalogProduct, NormalizedCatalogVariant } from '@/lib/ecommerce/types';

interface WooImage {
  src?: string | null;
}

interface WooProduct {
  id: number;
  name: string;
  sku?: string;
  type: string;
  price: string;
  stock_quantity: number | null;
  manage_stock: boolean;
  variations?: number[];
  images?: WooImage[];
}

interface WooVariation {
  id: number;
  sku: string;
  price: string;
  stock_quantity: number | null;
  manage_stock: boolean;
  attributes: { name: string; option: string }[];
  image?: WooImage | null;
}

function productImageSrc(p: WooProduct): string | null {
  const s = p.images?.find((img) => img.src?.trim())?.src?.trim();
  return s || null;
}

async function wooFetchAllVariationsForProduct(
  siteUrl: string,
  consumerKey: string,
  consumerSecret: string,
  productId: number
): Promise<WooVariation[]> {
  const all: WooVariation[] = [];
  for (let page = 1; page <= 50; page++) {
    const chunk = await wooFetchJson<WooVariation[]>(
      siteUrl,
      consumerKey,
      consumerSecret,
      `/products/${productId}/variations?per_page=100&page=${page}`
    );
    if (!chunk?.length) break;
    all.push(...chunk);
    if (chunk.length < 100) break;
  }
  return all;
}

export async function wooFetchAllCatalogProducts(
  siteUrl: string,
  consumerKey: string,
  consumerSecret: string,
  maxPages = 20
): Promise<NormalizedCatalogProduct[]> {
  const out: NormalizedCatalogProduct[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const list = await wooFetchJson<WooProduct[]>(
      siteUrl,
      consumerKey,
      consumerSecret,
      `/products?page=${page}&per_page=100&status=publish`
    );
    if (!list.length) break;

    for (const p of list) {
      if (p.type === 'grouped' || p.type === 'external') {
        continue;
      }

      const productDefaultImage = productImageSrc(p);

      if (p.type === 'variable') {
        const vars = await wooFetchAllVariationsForProduct(siteUrl, consumerKey, consumerSecret, p.id);
        if (!vars.length) {
          continue;
        }
        const variants: NormalizedCatalogVariant[] = vars.map((v) => {
          const vImg = v.image?.src?.trim();
          const imageUrl = vImg || productDefaultImage;
          return {
            externalProductId: String(p.id),
            externalVariantId: String(v.id),
            title: `${p.name} (${v.attributes?.map((a) => a.option).join(', ') || v.id})`,
            sku: v.sku || null,
            price: parseFloat(v.price) || 0,
            inventoryQuantity: v.manage_stock && v.stock_quantity != null ? v.stock_quantity : null,
            imageUrl: imageUrl || null,
          };
        });
        out.push({
          externalProductId: String(p.id),
          title: p.name,
          imageUrl: productDefaultImage,
          variants,
        });
        continue;
      }

      const qty = p.manage_stock && p.stock_quantity != null ? p.stock_quantity : null;
      const variants: NormalizedCatalogVariant[] = [
        {
          externalProductId: String(p.id),
          externalVariantId: String(p.id),
          title: p.name,
          sku: (p.sku && String(p.sku).trim()) || null,
          price: parseFloat(p.price) || 0,
          inventoryQuantity: qty,
          imageUrl: productDefaultImage,
        },
      ];
      out.push({
        externalProductId: String(p.id),
        title: p.name,
        imageUrl: productDefaultImage,
        variants,
      });
    }

    if (list.length < 100) break;
  }

  return out;
}

export async function wooSetProductStock(
  siteUrl: string,
  consumerKey: string,
  consumerSecret: string,
  externalProductId: string,
  externalVariantId: string,
  quantity: number
): Promise<void> {
  const isVariation = externalVariantId !== externalProductId;
  const path = isVariation
    ? `/products/${externalProductId}/variations/${externalVariantId}`
    : `/products/${externalProductId}`;
  await wooFetchJson(siteUrl, consumerKey, consumerSecret, path, {
    method: 'PUT',
    body: JSON.stringify({
      manage_stock: true,
      stock_quantity: Math.max(0, Math.floor(quantity)),
    }),
  });
}
