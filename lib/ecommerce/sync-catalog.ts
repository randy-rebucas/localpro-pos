import { getRepos, newId, type ChannelListingFields, type EcommerceIntegration, type ProductInput } from '@/lib/db';
import { getWooCommerceCredentials } from '@/lib/ecommerce/integration-credentials';
import { getShopifyAccessTokenForIntegration } from '@/lib/ecommerce/shopify-token';
import { shopifyFetchAllCatalogProducts } from '@/lib/ecommerce/shopify-catalog';
import { wooFetchAllCatalogProducts } from '@/lib/ecommerce/woocommerce-catalog';
import type { NormalizedCatalogVariant } from '@/lib/ecommerce/types';
import { logger } from '@/lib/logger';

type VariationOption = { size?: string; color?: string; type?: string };

/** Only the fields catalog sync reads from a POS product */
type CatalogProduct = {
  _id: string;
  sku?: string;
  image?: string;
  hasVariations?: boolean;
  variations?: Array<{ sku?: string; size?: string; color?: string; type?: string }>;
};

type SkuMatch = { product: CatalogProduct; variation?: VariationOption };

const SKU_CHUNK = 500;

/**
 * Resolve SKUs to products with one query per chunk (instead of up to two
 * findOne per variant). Matching mirrors the former per-SKU lookup:
 *  1. an active product with hasVariations whose variations contain the exact
 *     SKU wins (variation = first one whose trimmed SKU equals it);
 *  2. otherwise an active product whose own sku equals it.
 * When several products match, the first returned wins (as findOne did).
 */
async function loadSkuMatches(
  tenantId: string,
  skus: string[]
): Promise<{ byVariationSku: Map<string, SkuMatch>; byDirectSku: Map<string, CatalogProduct> }> {
  const byVariationSku = new Map<string, SkuMatch>();
  const byDirectSku = new Map<string, CatalogProduct>();

  for (let i = 0; i < skus.length; i += SKU_CHUNK) {
    const chunk = skus.slice(i, i + SKU_CHUNK);
    const wanted = new Set(chunk);
    const products: CatalogProduct[] = await getRepos().products.list(
      tenantId,
      { active: 'flagged', skuOrVariationSkuIn: chunk },
      { select: '_id sku image hasVariations variations.sku variations.size variations.color variations.type' }
    );

    for (const p of products) {
      if (p.hasVariations && p.variations) {
        for (const pv of p.variations) {
          const s = pv.sku;
          if (!s || !wanted.has(s) || byVariationSku.has(s)) continue;
          const v = p.variations.find((x) => (x.sku || '').trim() === s);
          if (v) {
            byVariationSku.set(s, { product: p, variation: { size: v.size, color: v.color, type: v.type } });
          }
        }
      }
      if (p.sku && wanted.has(p.sku) && !byDirectSku.has(p.sku)) {
        byDirectSku.set(p.sku, p);
      }
    }
  }

  return { byVariationSku, byDirectSku };
}

function buildProductFromVariant(
  v: NormalizedCatalogVariant,
  title: string,
  productImageUrl?: string | null
): ProductInput & { _id: string } {
  const name = v.title || title;
  const stock = v.inventoryQuantity != null ? Math.max(0, Math.floor(v.inventoryQuantity)) : 0;
  const image = (v.imageUrl || productImageUrl || '').trim() || undefined;
  return {
    _id: newId(),
    name: name.slice(0, 200),
    price: v.price,
    stock,
    sku: v.sku || undefined,
    image,
    productType: 'regular',
    hasVariations: false,
    trackInventory: true,
    taxExempt: false,
    isActive: true,
  };
}

export async function runCatalogSync(params: {
  integration: EcommerceIntegration;
  autoCreateProducts: boolean;
}): Promise<{ linked: number; created: number; skipped: number }> {
  const { integration, autoCreateProducts } = params;
  const { tenantId } = integration;
  let linked = 0;
  let created = 0;
  let skipped = 0;

  const products =
    integration.provider === 'shopify'
      ? await shopifyFetchAllCatalogProducts(
          integration.shopDomain || '',
          await getShopifyAccessTokenForIntegration(integration)
        )
      : await wooFetchAllCatalogProducts(
          integration.siteUrl || '',
          getWooCommerceCredentials(integration).consumerKey,
          getWooCommerceCredentials(integration).consumerSecret
        );

  const entries = products.flatMap((cp) => cp.variants.map((v) => ({ cp, v })));

  // 1. Resolve every SKU in one pass
  const skus = [
    ...new Set(entries.map(({ v }) => v.sku?.trim()).filter((s): s is string => Boolean(s))),
  ];
  const { byVariationSku, byDirectSku } = skus.length
    ? await loadSkuMatches(tenantId, skus)
    : { byVariationSku: new Map<string, SkuMatch>(), byDirectSku: new Map<string, CatalogProduct>() };

  // 2. Assign each variant a match, or queue a product to create. A product
  //    queued for one variant is matched by later variants with the same SKU,
  //    as when products were created one at a time.
  const toCreate: ReturnType<typeof buildProductFromVariant>[] = [];
  const resolved: Array<{ v: NormalizedCatalogVariant; channelImage: string; match: SkuMatch | null }> = [];
  for (const { cp, v } of entries) {
    const s = v.sku?.trim();
    let match: SkuMatch | null = null;
    if (s) {
      match = byVariationSku.get(s) ?? null;
      if (!match) {
        const direct = byDirectSku.get(s);
        if (direct) match = { product: direct };
      }
    }
    if (!match && autoCreateProducts) {
      const doc = buildProductFromVariant(v, cp.title, cp.imageUrl);
      toCreate.push(doc);
      const product: CatalogProduct = { _id: doc._id, sku: doc.sku, image: doc.image, hasVariations: false };
      match = { product };
      if (s) byDirectSku.set(s, product);
    }
    resolved.push({ v, channelImage: (v.imageUrl || cp.imageUrl || '').trim(), match });
  }

  // 3. Create the missing products in one write; variants whose product failed are skipped
  const pendingIds = new Set(toCreate.map((d) => d._id));
  const createdIds = new Set<string>();
  if (toCreate.length) {
    // Unordered insert: returns the ids that landed even when some rows were rejected
    const { insertedIds, error } = await getRepos().products.createMany(tenantId, toCreate);
    if (error) logger.error('sync catalog product create error', { err: error });
    for (const id of insertedIds) createdIds.add(id);
    created = createdIds.size;
  }

  // 4. Image back-fill and listing upserts, batched
  const imageUpdates = new Map<string, string>();
  const listingOps = new Map<string, { item: { externalVariantId: string; set: ChannelListingFields }; variants: number }>();
  for (const { v, channelImage, match } of resolved) {
    if (!match) {
      skipped += 1;
      continue;
    }
    const pid = match.product._id;
    if (pendingIds.has(pid) && !createdIds.has(pid)) {
      skipped += 1;
      continue;
    }

    if (channelImage && !(match.product.image || '').trim()) {
      imageUpdates.set(pid, channelImage);
      match.product.image = channelImage;
    }

    // Same externalVariantId twice: the last one wins, as with sequential upserts
    const prev = listingOps.get(v.externalVariantId);
    listingOps.set(v.externalVariantId, {
      variants: (prev?.variants ?? 0) + 1,
      item: {
        externalVariantId: v.externalVariantId,
        set: {
          productId: match.product._id,
          externalProductId: v.externalProductId,
          inventoryItemId: v.inventoryItemId,
          sku: v.sku || undefined,
          variation: match.variation,
        },
      },
    });
  }

  if (imageUpdates.size) {
    try {
      await getRepos().products.updateEach(
        tenantId,
        [...imageUpdates].map(([id, image]) => ({ id, set: { image } }))
      );
    } catch (e) {
      // Image back-fill is cosmetic — still link the listings
      logger.error('sync catalog image update error', { err: e });
    }
  }

  const ops = [...listingOps.values()];
  const totalVariants = ops.reduce((n, o) => n + o.variants, 0);
  if (ops.length) {
    const { error, failedIndexes: failed } = await getRepos().channelListings.upsertManyByVariant(
      tenantId,
      integration.provider,
      ops.map((o) => o.item)
    );
    if (!error) {
      linked = totalVariants;
    } else {
      logger.error('sync catalog listing upsert error', { err: error, failed: failed?.length });
      const failedVariants = failed
        ? [...new Set(failed)].reduce((n, idx) => n + (ops[idx]?.variants ?? 0), 0)
        : totalVariants;
      linked = totalVariants - failedVariants;
      skipped += failedVariants;
    }
  }

  await getRepos().ecommerceIntegrations.update(tenantId, integration.provider, {
    lastSyncAt: new Date(),
    lastError: undefined,
  });

  return { linked, created, skipped };
}
