import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import ProductChannelListing from '@/models/ProductChannelListing';
import TenantEcommerceIntegration from '@/models/TenantEcommerceIntegration';
import { getCurrentUser } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { requireEcommerceIntegrationFeature } from '@/lib/ecommerce/require-ecommerce-feature';
import { getShopifyAccessTokenForIntegration } from '@/lib/ecommerce/shopify-token';
import {
  shopifyCreateProduct,
  shopifyUpdateProduct,
  shopifyPushInitialInventory,
} from '@/lib/ecommerce/shopify-product-push';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    if (!['owner', 'admin', 'manager'].includes(user.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const rl = checkRateLimit(`shopify-product-push:${user.tenantId}`, 30, 60_000);
    if (!rl.allowed) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    await requireEcommerceIntegrationFeature(user.tenantId);

    const body = await request.json();
    const { productId, mode = 'create' } = body as { productId: string; mode?: 'create' | 'update' };

    if (!productId) return NextResponse.json({ success: false, error: 'productId required' }, { status: 400 });

    await connectDB();

    const [product, integration] = await Promise.all([
      Product.findOne({ _id: productId, tenantId: user.tenantId }),
      TenantEcommerceIntegration.findOne({ tenantId: user.tenantId, provider: 'shopify', isActive: true }),
    ]);

    if (!product) return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    if (!integration?.shopDomain) {
      return NextResponse.json({ success: false, error: 'No active Shopify integration' }, { status: 400 });
    }

    const accessToken = await getShopifyAccessTokenForIntegration(integration);
    const existingListing = await ProductChannelListing.findOne({
      tenantId: user.tenantId,
      productId,
      provider: 'shopify',
    });

    let externalProductId: string;
    let externalVariantId: string;
    let inventoryItemId: string;

    if (mode === 'update' && existingListing?.externalProductId) {
      await shopifyUpdateProduct(integration.shopDomain, accessToken, existingListing.externalProductId, {
        title: product.name,
        body_html: product.description || '',
        price: product.price,
      });
      externalProductId = existingListing.externalProductId;
      externalVariantId = existingListing.externalVariantId || '';
      inventoryItemId = existingListing.inventoryItemId || '';
    } else {
      const created = await shopifyCreateProduct(integration.shopDomain, accessToken, product);
      externalProductId = created.externalProductId;
      externalVariantId = created.externalVariantId;
      inventoryItemId = created.inventoryItemId;

      // Push initial stock
      if (integration.shopifyLocationId && inventoryItemId) {
        await shopifyPushInitialInventory(
          integration.shopDomain,
          accessToken,
          integration.shopifyLocationId,
          inventoryItemId,
          product.stock
        );
      }
    }

    // Upsert the listing
    await ProductChannelListing.findOneAndUpdate(
      { tenantId: user.tenantId, productId, provider: 'shopify' },
      {
        tenantId: user.tenantId,
        productId,
        provider: 'shopify',
        externalProductId,
        externalVariantId,
        inventoryItemId,
      },
      { upsert: true, new: true }
    );

    await createAuditLog(request, {
      tenantId: user.tenantId,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'product',
      entityId: productId,
      changes: { shopifySync: mode, externalProductId },
    });

    return NextResponse.json({ success: true, data: { externalProductId, externalVariantId } });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to push product to Shopify');
  }
}
