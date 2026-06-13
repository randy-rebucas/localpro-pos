import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import { requireTenantAccess } from '@/lib/api-tenant';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

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

    const query: Record<string, unknown> = { tenantId, isActive: { $ne: false } };
    if (filter === 'missing-barcode') {
      query.$or = [
        { barcode: { $exists: false } },
        { barcode: null },
        { barcode: '' },
        { barcode: /^\s*$/ },
      ];
    } else if (filter === 'missing-image') {
      query.$or = [{ image: { $exists: false } }, { image: null }, { image: '' }];
    }
    // filter === 'all' applies no extra condition

    const products = await Product.find(query, { _id: 1 })
      .sort({ updatedAt: 1 })
      .lean();

    const productIds = products.map((p) => String(p._id));

    return NextResponse.json({
      success: true,
      data: { total: productIds.length, productIds },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to initialize scan session');
  }
}
