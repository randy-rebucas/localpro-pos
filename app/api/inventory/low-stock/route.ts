import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getLowStockProducts } from '@/lib/stock';
import { getTenantIdForUser } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';
import { handleApiError } from '@/lib/error-handler';
import { hasAnyTenantPermission } from '@/lib/permissions-server';

const LOW_STOCK_PERMISSIONS = ['dashboard.view', 'inventory.view', 'products.edit', 'products.restock'];

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const tenantId = await getTenantIdForUser(request, user);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    // Shown on the dashboard tile and the stock screens, so any role that can
    // see the dashboard or manage stock/products may read it.
    if (!(await hasAnyTenantPermission(user.role, tenantId, LOW_STOCK_PERMISSIONS))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const branchId = searchParams.get('branchId') || undefined;
    const threshold = searchParams.get('threshold') ? parseInt(searchParams.get('threshold')!) : undefined;

    // Get tenant settings for default threshold
    const tenantSettings = await prisma.tenantSettings.findUnique({ where: { tenantId }, select: { lowStockThreshold: true } });
    const defaultThreshold = tenantSettings?.lowStockThreshold || 10;
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

