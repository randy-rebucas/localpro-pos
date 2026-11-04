import { NextRequest, NextResponse } from 'next/server';
import { getLowStockProducts } from '@/lib/stock';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { getRepos } from '@/lib/db';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';
import { handleApiError } from '@/lib/error-handler';

export async function GET(request: NextRequest) {
  try {
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
    const tenant = await getRepos().tenants.findById(tenantId, { select: 'settings.lowStockThreshold' });
    const defaultThreshold = tenant?.settings?.lowStockThreshold || 10;
    const finalThreshold = threshold || defaultThreshold;

    const lowStockProducts = await getLowStockProducts(tenantId, branchId, finalThreshold);

    return NextResponse.json({
      success: true,
      data: lowStockProducts,
      threshold: finalThreshold,
      count: lowStockProducts.length,
    });
  } catch (error) {
    logger.error('Error fetching low stock products:', error);
    return handleApiError(error, 'Failed to fetch low stock products');
  }
}

