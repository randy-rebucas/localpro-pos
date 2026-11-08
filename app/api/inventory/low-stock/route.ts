import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getLowStockProducts } from '@/lib/stock';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import Tenant from '@/models/Tenant';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';
import { handleApiError } from '@/lib/error-handler';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const user = await requireAuth(request); // eslint-disable-line @typescript-eslint/no-unused-vars
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    const searchParams = request.nextUrl.searchParams;
    const branchId = searchParams.get('branchId') || undefined;
    const threshold = searchParams.get('threshold') ? parseInt(searchParams.get('threshold')!) : undefined;

    // Get tenant settings for default threshold
    const tenant = await Tenant.findById(tenantId).select('settings.lowStockThreshold').lean();
    const defaultThreshold = tenant?.settings?.lowStockThreshold ?? 10;
    // An explicit ?threshold= applies to every product; otherwise each product's
    // own threshold wins and the store setting covers the rest
    const override = threshold !== undefined && !Number.isNaN(threshold) ? threshold : undefined;

    const lowStockProducts = await getLowStockProducts(tenantId, branchId, override, defaultThreshold);

    return NextResponse.json({
      success: true,
      data: lowStockProducts,
      threshold: override ?? defaultThreshold,
      count: lowStockProducts.length,
    });
  } catch (error) {
    logger.error('Error fetching low stock products:', error);
    return handleApiError(error, 'Failed to fetch low stock products');
  }
}

