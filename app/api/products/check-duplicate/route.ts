import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import { requireTenantAccess } from '@/lib/api-tenant';
import { handleApiError } from '@/lib/error-handler';

/**
 * Live duplicate-name check used by the product form while typing/on blur, so a
 * duplicate is caught before submit instead of only at create time.
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const tenantId = authResult.tenantId;

    const searchParams = request.nextUrl.searchParams;
    const name = (searchParams.get('name') || '').trim();
    const excludeId = searchParams.get('excludeId') || undefined;

    if (!name) {
      return NextResponse.json({ success: true, exists: false });
    }

    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const query: Record<string, unknown> = {
      tenantId,
      isActive: { $ne: false },
      name: { $regex: `^${escapedName}$`, $options: 'i' },
    };
    if (excludeId) {
      query._id = { $ne: excludeId };
    }

    const existing = await Product.findOne(query).select('_id name sku stock').lean();

    return NextResponse.json({
      success: true,
      exists: !!existing,
      product: existing || undefined,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to check for duplicate product');
  }
}
