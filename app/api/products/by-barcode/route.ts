import { NextRequest, NextResponse } from 'next/server';
import { getRepos } from '@/lib/db';
import { requireTenantAccess } from '@/lib/api-tenant';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';

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

    // Exact match first — served by the { tenantId, barcode } / { tenantId, sku }
    // indexes. A case-insensitive regex can't use tight index bounds and walks
    // every key for the tenant, so it's only the fallback.
    const trimmedCode = code.trim();
    const { products } = getRepos();
    let product = await products.findOne(tenantId, { active: true, code: trimmedCode });
    if (!product) {
      product = await products.findOne(tenantId, { active: true, code: trimmedCode, codeInsensitive: true });
    }

    if (!product) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND', data: null }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { product } });
  } catch (error) {
    return handleApiError(error, 'Failed to look up product by barcode');
  }
}
