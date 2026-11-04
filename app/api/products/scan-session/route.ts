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
    const { allowed } = checkRateLimit(`scan-session:${tenantId}:${ip}`, 10, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const searchParams = request.nextUrl.searchParams;
    // Default to missing-barcode — only load products that still need to be completed
    const filter = searchParams.get('filter') ?? 'missing-barcode';

    // filter === 'all' applies no extra condition
    const missing = filter === 'missing-barcode' ? 'barcode' : filter === 'missing-image' ? 'image' : undefined;
    const products = await getRepos().products.list(
      tenantId,
      { active: true, ...(missing && { missing }) },
      { select: '_id', sort: 'updatedAt' }
    );

    const productIds = products.map((p) => p._id);

    return NextResponse.json({
      success: true,
      data: { total: productIds.length, productIds },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to initialize scan session');
  }
}
