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

async function findProductBySku(
  tenantId: mongoose.Types.ObjectId,
  sku: string | null
): Promise<{
  product: InstanceType<typeof Product>;
  variation?: { size?: string; color?: string; type?: string };
} | null> {
  if (!sku?.trim()) return null;
  const s = sku.trim();
  const withVar = await Product.findOne({
    tenantId,
    isActive: true,
    hasVariations: true,
    variations: { $elemMatch: { sku: s } },
  });
  if (withVar?.variations) {
    const v = withVar.variations.find((x) => (x.sku || '').trim() === s);
    if (v) {
      return {
        product: withVar,
        variation: { size: v.size, color: v.color, type: v.type },
      };
    }
  }
  const direct = await Product.findOne({ tenantId, sku: s, isActive: true });
  return direct ? { product: direct } : null;
}

async function createProductFromVariant(
  tenantId: mongoose.Types.ObjectId,
  v: NormalizedCatalogVariant,
  title: string,
  productImageUrl?: string | null
): Promise<InstanceType<typeof Product>> {
  const name = v.title || title;
  const stock = v.inventoryQuantity != null ? Math.max(0, Math.floor(v.inventoryQuantity)) : 0;
  const image = (v.imageUrl || productImageUrl || '').trim() || undefined;
  const [p] = await Product.create([
    {
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
    },
  ]);
  return p;
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

  for (const cp of products) {
    for (const v of cp.variants) {
      try {
        let match = await findProductBySku(tenantId, v.sku);
        if (!match && autoCreateProducts) {
          const p = await createProductFromVariant(tenantId, v, cp.title, cp.imageUrl);
          match = { product: p };
          created += 1;
        }
        if (!match) {
          skipped += 1;
          continue;
        }

        const channelImage = (v.imageUrl || cp.imageUrl || '').trim();
        if (channelImage && !(match.product.image || '').trim()) {
          await Product.updateOne({ _id: match.product._id }, { $set: { image: channelImage } });
          match.product.image = channelImage;
        }

        await ProductChannelListing.findOneAndUpdate(
          {
            tenantId,
            provider: integration.provider,
            externalVariantId: v.externalVariantId,
          },
          {
            $set: {
              productId: match.product._id,
              externalProductId: v.externalProductId,
              inventoryItemId: v.inventoryItemId,
              sku: v.sku || undefined,
              variation: match.variation,
            },
          },
          { upsert: true, new: true }
        );
        linked += 1;
      } catch (e) {
        logger.error('sync catalog variant error', { err: e, variant: v.externalVariantId });
        skipped += 1;
      }
    }
  }

  await TenantEcommerceIntegration.updateOne(
    { _id: integration._id },
    { $set: { lastSyncAt: new Date(), lastError: undefined } }
  );

  return { linked, created, skipped };
}
