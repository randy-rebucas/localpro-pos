import { NextRequest, NextResponse } from 'next/server';
import { getRepos, isDuplicateKeyError, type BundleFilter } from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
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

    const filter: BundleFilter = {};
    if (search) {
      filter.search = search;
    }
    if (isActive !== null && isActive !== '') {
      filter.isActive = isActive === 'true';
    }
    if (categoryId) {
      filter.categoryId = categoryId;
    }
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.gte = parseFloat(minPrice);
      if (maxPrice) filter.price.lte = parseFloat(maxPrice);
    }
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.lte = end;
      }
    }

    const bundles = await getRepos().bundles.list(tenantId, filter, { populate: true });

    return NextResponse.json({ success: true, data: bundles });
  } catch (_error: unknown) {
    logger.error('Error fetching bundles:', _error);
    return NextResponse.json({ success: false, error: 'Failed to fetch bundles' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    if (!(await hasTenantPermission(user.role, tenantId, 'bundles.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, price, items, sku, categoryId, image, trackInventory } = body;

    if (!name || !price || !items || items.length === 0) {
      return NextResponse.json(
        { success: false, error: t('validation.bundleFieldsRequired', 'Name, price, and at least one item are required') },
        { status: 400 }
      );
    }

    const bundle = await getRepos().bundles.create(tenantId, {
      name,
      description,
      price,
      items,
      sku,
      categoryId,
      image,
      trackInventory: trackInventory !== false,
      isActive: true,
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
    if (isDuplicateKeyError(error)) {
      return NextResponse.json(
        { success: false, error: t('validation.bundleSkuExists', 'Bundle with this SKU already exists') },
        { status: 400 }
      );
    }
    logger.error('Error creating bundle:', error);
    return NextResponse.json({ success: false, error: 'Failed to create bundle' }, { status: 400 });
  }
}

