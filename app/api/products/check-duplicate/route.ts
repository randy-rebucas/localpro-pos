import { NextRequest, NextResponse } from 'next/server';
import { getRepos } from '@/lib/db';
import { requireTenantAccess } from '@/lib/api-tenant';
import { handleApiError } from '@/lib/error-handler';

/**
 * Live duplicate-name check used by the product form while typing/on blur, so a
 * duplicate is caught before submit instead of only at create time.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const tenantId = authResult.tenantId;

    const searchParams = request.nextUrl.searchParams;
    const name = (searchParams.get('name') || '').trim();
    const excludeId = searchParams.get('excludeId') || undefined;

    if (!name) {
      return NextResponse.json({ success: true, exists: false });
    }

    const existing = await getRepos().products.findOne(
      tenantId,
      { active: true, name, ...(excludeId && { excludeId }) },
      { select: '_id name sku stock' }
    );

    return NextResponse.json({
      success: true,
      exists: !!existing,
      product: existing || undefined,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to check for duplicate product');
  }
}
