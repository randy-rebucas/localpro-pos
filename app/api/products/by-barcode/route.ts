import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import { requireTenantAccess } from '@/lib/api-tenant';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { findVariationBySku } from '@/lib/product-variations';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId } = authResult;

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`by-barcode:${tenantId}:${ip}`, 120, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const code = request.nextUrl.searchParams.get('code');
    if (!code || code.trim() === '') {
      return NextResponse.json({ success: false, error: 'code query param is required' }, { status: 400 });
    }

    // Exact matches first, served by the { tenantId, barcode }, { tenantId, sku } and
    // { tenantId, variations.sku } indexes. A case-insensitive regex can't use tight
    // index bounds and walks every key for the tenant, so it's only the fallback.
    // A product's own code beats a variation SKU, which isn't unique across products.
    const trimmedCode = code.trim();
    const active = { tenantId, isActive: { $ne: false } };
    let product = await Product.findOne({
      ...active,
      $or: [{ barcode: trimmedCode }, { sku: trimmedCode }],
    }).lean();
    if (!product) {
      product = await Product.findOne({ ...active, hasVariations: true, 'variations.sku': trimmedCode }).lean();
    }
    if (!product) {
      const escapedCode = trimmedCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const anyCase = { $regex: `^${escapedCode}$`, $options: 'i' };
      product = await Product.findOne({
        ...active,
        $or: [{ barcode: anyCase }, { sku: anyCase }, { hasVariations: true, 'variations.sku': anyCase }],
      }).lean();
    }

    if (!product) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND', data: null }, { status: 404 });
    }

    const foldedCode = trimmedCode.toLowerCase();
    const isProductCode = [product.barcode, product.sku].some((value) => value?.toLowerCase() === foldedCode);
    const variation = isProductCode ? undefined : findVariationBySku(product, trimmedCode);

    return NextResponse.json({ success: true, data: { product, ...(variation ? { variation } : {}) } });
  } catch (error) {
    return handleApiError(error, 'Failed to look up product by barcode');
  }
}
