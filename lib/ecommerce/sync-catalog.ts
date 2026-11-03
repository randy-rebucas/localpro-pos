import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import ProductChannelListing from '@/models/ProductChannelListing';
import TenantEcommerceIntegration from '@/models/TenantEcommerceIntegration';
import type { ITenantEcommerceIntegration } from '@/models/TenantEcommerceIntegration';
import { getWooCommerceCredentials } from '@/lib/ecommerce/integration-credentials';
import { getShopifyAccessTokenForIntegration } from '@/lib/ecommerce/shopify-token';
import { shopifyFetchAllCatalogProducts } from '@/lib/ecommerce/shopify-catalog';
import { wooFetchAllCatalogProducts } from '@/lib/ecommerce/woocommerce-catalog';
import type { NormalizedCatalogVariant } from '@/lib/ecommerce/types';
import { logger } from '@/lib/logger';

type VariationOption = { size?: string; color?: string; type?: string };

/** Only the fields catalog sync reads from a POS product */
type CatalogProduct = {
  _id: mongoose.Types.ObjectId;
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
  tenantId: mongoose.Types.ObjectId,
  skus: string[]
): Promise<{ byVariationSku: Map<string, SkuMatch>; byDirectSku: Map<string, CatalogProduct> }> {
  const byVariationSku = new Map<string, SkuMatch>();
  const byDirectSku = new Map<string, CatalogProduct>();

  for (let i = 0; i < skus.length; i += SKU_CHUNK) {
    const chunk = skus.slice(i, i + SKU_CHUNK);
    const wanted = new Set(chunk);
    const products = await Product.find({
      tenantId,
      isActive: true,
      $or: [{ sku: { $in: chunk } }, { hasVariations: true, 'variations.sku': { $in: chunk } }],
    })
      .select('_id sku image hasVariations variations.sku variations.size variations.color variations.type')
      .lean<CatalogProduct[]>();

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
  tenantId: mongoose.Types.ObjectId,
  v: NormalizedCatalogVariant,
  title: string,
  productImageUrl?: string | null
) {
  const name = v.title || title;
  const stock = v.inventoryQuantity != null ? Math.max(0, Math.floor(v.inventoryQuantity)) : 0;
  const image = (v.imageUrl || productImageUrl || '').trim() || undefined;
  return {
    _id: new mongoose.Types.ObjectId(),
    tenantId,
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

/** Op indexes that failed in an unordered bulkWrite, or null if unknown */
function failedWriteIndexes(err: unknown): number[] | null {
  const writeErrors = (err as { writeErrors?: unknown })?.writeErrors;
  if (!writeErrors) return null;
  const list = Array.isArray(writeErrors) ? writeErrors : [writeErrors];
  const indexes = list
    .map((we) => {
      const w = we as { index?: number; err?: { index?: number } };
      return w.index ?? w.err?.index;
    })
    .filter((n): n is number => typeof n === 'number');
  return indexes.length === list.length ? indexes : null;
}

export async function runCatalogSync(params: {
  integration: ITenantEcommerceIntegration;
  autoCreateProducts: boolean;
}): Promise<{ linked: number; created: number; skipped: number }> {
  await connectDB();
  const { integration, autoCreateProducts } = params;
  const tenantId = integration.tenantId as mongoose.Types.ObjectId;
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
      const doc = buildProductFromVariant(tenantId, v, cp.title, cp.imageUrl);
      toCreate.push(doc);
      const product: CatalogProduct = { _id: doc._id, sku: doc.sku, image: doc.image, hasVariations: false };
      match = { product };
      if (s) byDirectSku.set(s, product);
    }
    resolved.push({ v, channelImage: (v.imageUrl || cp.imageUrl || '').trim(), match });
  }

  // 3. Create the missing products in one write; variants whose product failed are skipped
  const pendingIds = new Set(toCreate.map((d) => d._id.toString()));
  const createdIds = new Set<string>();
  if (toCreate.length) {
    try {
      const inserted = await Product.insertMany(toCreate, { ordered: false });
      for (const d of inserted) createdIds.add(d._id.toString());
    } catch (e) {
      logger.error('sync catalog product create error', { err: e });
      // Unordered insert: some may have landed — check which
      const present = await Product.find({ tenantId, _id: { $in: toCreate.map((d) => d._id) } })
        .select('_id')
        .lean<{ _id: mongoose.Types.ObjectId }[]>();
      for (const d of present) createdIds.add(d._id.toString());
    }
    created = createdIds.size;
  }

  // 4. Image back-fill and listing upserts, batched
  const imageUpdates = new Map<string, string>();
  const listingOps = new Map<string, { op: Record<string, unknown>; variants: number }>();
  for (const { v, channelImage, match } of resolved) {
    if (!match) {
      skipped += 1;
      continue;
    }
    const pid = match.product._id.toString();
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
      op: {
        updateOne: {
          filter: { tenantId, provider: integration.provider, externalVariantId: v.externalVariantId },
          update: {
            $set: {
              productId: match.product._id,
              externalProductId: v.externalProductId,
              inventoryItemId: v.inventoryItemId,
              sku: v.sku || undefined,
              variation: match.variation,
            },
          },
          upsert: true,
        },
      },
    });
  }

  if (imageUpdates.size) {
    try {
      await Product.bulkWrite(
        [...imageUpdates].map(([pid, image]) => ({
          updateOne: { filter: { _id: pid, tenantId }, update: { $set: { image } } },
        })),
        { ordered: false }
      );
    } catch (e) {
      // Image back-fill is cosmetic — still link the listings
      logger.error('sync catalog image update error', { err: e });
    }
  }

  const ops = [...listingOps.values()];
  const totalVariants = ops.reduce((n, o) => n + o.variants, 0);
  if (ops.length) {
    try {
      await ProductChannelListing.bulkWrite(
        ops.map((o) => o.op) as Parameters<typeof ProductChannelListing.bulkWrite>[0],
        { ordered: false }
      );
      linked = totalVariants;
    } catch (e) {
      const failed = failedWriteIndexes(e);
      logger.error('sync catalog listing upsert error', { err: e, failed: failed?.length });
      const failedVariants = failed
        ? [...new Set(failed)].reduce((n, idx) => n + (ops[idx]?.variants ?? 0), 0)
        : totalVariants;
      linked = totalVariants - failedVariants;
      skipped += failedVariants;
    }
  }

  await TenantEcommerceIntegration.updateOne(
    { _id: integration._id },
    { $set: { lastSyncAt: new Date(), lastError: undefined } }
  );

  return { linked, created, skipped };
}
