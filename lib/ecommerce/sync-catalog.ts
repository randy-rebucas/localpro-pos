import prisma from '@/lib/prisma';
import type { Prisma, Product as PrismaProduct } from '@prisma/client';
import { getWooCommerceCredentials } from '@/lib/ecommerce/integration-credentials';
import { getShopifyAccessTokenForIntegration } from '@/lib/ecommerce/shopify-token';
import { shopifyFetchAllCatalogProducts } from '@/lib/ecommerce/shopify-catalog';
import { wooFetchAllCatalogProducts } from '@/lib/ecommerce/woocommerce-catalog';
import type { NormalizedCatalogVariant } from '@/lib/ecommerce/types';
import { logger } from '@/lib/logger';

interface ProductVariation {
  size?: string;
  color?: string;
  type?: string;
  sku?: string;
  price?: number;
  stock?: number;
}

async function findProductBySku(
  tenantId: string,
  sku: string | null
): Promise<{
  product: PrismaProduct;
  variation?: { size?: string; color?: string; type?: string };
} | null> {
  if (!sku?.trim()) return null;
  const s = sku.trim();

  const withVarCandidates = await prisma.product.findMany({
    where: { tenantId, isActive: true, hasVariations: true },
  });
  for (const candidate of withVarCandidates) {
    const variations = (candidate.variations as unknown as ProductVariation[]) || [];
    const v = variations.find((x) => (x.sku || '').trim() === s);
    if (v) {
      return { product: candidate, variation: { size: v.size, color: v.color, type: v.type } };
    }
  }

  const direct = await prisma.product.findFirst({ where: { tenantId, sku: s, isActive: true } });
  return direct ? { product: direct } : null;
}

async function createProductFromVariant(
  tenantId: string,
  v: NormalizedCatalogVariant,
  title: string,
  productImageUrl?: string | null
): Promise<PrismaProduct> {
  const name = v.title || title;
  const stock = v.inventoryQuantity != null ? Math.max(0, Math.floor(v.inventoryQuantity)) : 0;
  const image = (v.imageUrl || productImageUrl || '').trim() || undefined;
  return prisma.product.create({
    data: {
      tenantId,
      name: name.slice(0, 200),
      price: v.price,
      stock: BigInt(stock),
      sku: v.sku || undefined,
      image,
      productType: 'regular',
      hasVariations: false,
      trackInventory: true,
      taxExempt: false,
      isActive: true,
    },
  });
}

export async function runCatalogSync(params: {
  integration: {
    id: string;
    tenantId: string;
    provider: string;
    shopDomain: string | null;
    siteUrl: string | null;
    credentialsEncrypted: string;
  };
  autoCreateProducts: boolean;
}): Promise<{ linked: number; created: number; skipped: number }> {
  const { integration, autoCreateProducts } = params;
  const tenantId = integration.tenantId;
  let linked = 0;
  let created = 0;
  let skipped = 0;

  const products =
    integration.provider === 'shopify'
      ? await shopifyFetchAllCatalogProducts(
          integration.shopDomain || '',
          await getShopifyAccessTokenForIntegration({ _id: integration.id, credentialsEncrypted: integration.credentialsEncrypted, shopDomain: integration.shopDomain })
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
          await prisma.product.update({ where: { id: match.product.id }, data: { image: channelImage } });
          match.product.image = channelImage;
        }

        await prisma.productChannelListing.upsert({
          where: {
            tenantId_provider_externalVariantId: {
              tenantId,
              provider: integration.provider as never,
              externalVariantId: v.externalVariantId,
            },
          },
          create: {
            tenantId,
            provider: integration.provider as never,
            externalVariantId: v.externalVariantId,
            productId: match.product.id,
            externalProductId: v.externalProductId,
            inventoryItemId: v.inventoryItemId,
            sku: v.sku || undefined,
            variation: (match.variation as Prisma.InputJsonValue) ?? undefined,
          },
          update: {
            productId: match.product.id,
            externalProductId: v.externalProductId,
            inventoryItemId: v.inventoryItemId,
            sku: v.sku || undefined,
            variation: (match.variation as Prisma.InputJsonValue) ?? undefined,
          },
        });
        linked += 1;
      } catch (e) {
        logger.error('sync catalog variant error', { err: e, variant: v.externalVariantId });
        skipped += 1;
      }
    }
  }

  await prisma.tenantEcommerceIntegration.update({
    where: { id: integration.id },
    data: { lastSyncAt: new Date(), lastError: null },
  });

  return { linked, created, skipped };
}
