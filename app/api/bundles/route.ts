import { NextRequest, NextResponse } from 'next/server';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';
import { findBundles, createBundle } from '@/lib/data/bundles';

export async function GET(request: NextRequest) {
  try {
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const isActive = searchParams.get('isActive');
    const categoryId = searchParams.get('categoryId');
    const minPrice = searchParams.get('minPrice');
    const maxPrice = searchParams.get('maxPrice');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    let end: Date | undefined;
    if (endDate) {
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
    }

    const bundles = await findBundles(tenantId, {
      search,
      isActive: isActive !== null && isActive !== '' ? isActive === 'true' : undefined,
      categoryId: categoryId || undefined,
      minPrice: minPrice ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: end,
    });

    return NextResponse.json({ success: true, data: bundles });
  } catch (_error: unknown) {
    logger.error('Error fetching bundles:', _error);
    return NextResponse.json({ success: false, error: 'Failed to fetch bundles' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    const body = await request.json();
    const { name, description, price, items, sku, categoryId, image, trackInventory } = body;

    if (!name || !price || !items || items.length === 0) {
      return NextResponse.json(
        { success: false, error: t('validation.bundleFieldsRequired', 'Name, price, and at least one item are required') },
        { status: 400 }
      );
    }

    const bundle = await createBundle(tenantId, {
      name,
      description,
      price,
      items,
      sku,
      categoryId,
      image,
      trackInventory,
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.CREATE,
      entityType: 'bundle',
      entityId: bundle._id,
      changes: body,
    });

    return NextResponse.json({ success: true, data: bundle }, { status: 201 });
  } catch (error: unknown) {
    const t = await getValidationTranslatorFromRequest(request);
    if ((error as Record<string, unknown>).code === 'P2002') {
      return NextResponse.json(
        { success: false, error: t('validation.bundleSkuExists', 'Bundle with this SKU already exists') },
        { status: 400 }
      );
    }
    logger.error('Error creating bundle:', error);
    return NextResponse.json({ success: false, error: 'Failed to create bundle' }, { status: 400 });
  }
}
