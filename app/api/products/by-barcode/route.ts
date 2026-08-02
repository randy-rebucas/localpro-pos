import { NextRequest, NextResponse } from 'next/server';
import { requireTenantAccess } from '@/lib/api-tenant';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { findProductByBarcodeOrSku, serializeProduct } from '@/lib/data/products';

export async function GET(request: NextRequest) {
  try {
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

    const product = await findProductByBarcodeOrSku(tenantId, code.trim());

    if (!product) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND', data: null }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { product: serializeProduct(product) } });
  } catch (error) {
    return handleApiError(error, 'Failed to look up product by barcode');
  }
}
