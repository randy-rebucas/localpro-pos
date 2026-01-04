import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import StockMovement from '@/models/StockMovement';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    const searchParams = request.nextUrl.searchParams;
    const productId = searchParams.get('productId');
    const type = searchParams.get('type');
    const limit = parseInt(searchParams.get('limit') || '50');
    const page = parseInt(searchParams.get('page') || '1');
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = { tenantId };
    if (productId) {
      query.productId = productId;
    }
    if (type) {
      query.type = type;
    }

    const movements = await StockMovement.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .populate('productId', 'name sku')
      .populate('userId', 'name email')
      .populate('transactionId', 'receiptNumber')
      .lean();

    const total = await StockMovement.countDocuments(query);

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
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

