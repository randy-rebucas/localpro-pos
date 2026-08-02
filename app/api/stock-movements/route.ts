import { NextRequest, NextResponse } from 'next/server';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { findStockMovements } from '@/lib/data/stock-movements';

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    const searchParams = request.nextUrl.searchParams;
    const productId = searchParams.get('productId');
    const type = searchParams.get('type');
    const rawLimit = parseInt(searchParams.get('limit') || '50');
    const limit = Math.min(Math.max(1, rawLimit), 200);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const skip = (page - 1) * limit;

    const { movements, total } = await findStockMovements(
      tenantId,
      { productId: productId || undefined, type: type || undefined },
      { skip, limit }
    );

    return NextResponse.json({
      success: true,
      data: movements,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
