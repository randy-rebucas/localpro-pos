import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getLowStockProducts } from '@/lib/data/inventory';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
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
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
    const settings = tenant?.settings as { lowStockThreshold?: number } | null;
    const defaultThreshold = settings?.lowStockThreshold || 10;
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
