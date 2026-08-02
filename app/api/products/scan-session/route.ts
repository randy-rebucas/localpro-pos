import { NextRequest, NextResponse } from 'next/server';
import { requireTenantAccess } from '@/lib/api-tenant';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { listProductIdsForScanSession } from '@/lib/data/products';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId } = authResult;

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`scan-session:${tenantId}:${ip}`, 10, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const searchParams = request.nextUrl.searchParams;
    // Default to missing-barcode — only load products that still need to be completed
    const filter = searchParams.get('filter') ?? 'missing-barcode';

    const productIds = await listProductIdsForScanSession(tenantId, filter);

    return NextResponse.json({
      success: true,
      data: { total: productIds.length, productIds },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to initialize scan session');
  }
}
