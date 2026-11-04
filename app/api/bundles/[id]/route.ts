import { NextRequest, NextResponse } from 'next/server';
import { getRepos, isDuplicateKeyError, type BundleInput, type Patch } from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    const bundle = await getRepos().bundles.findById(tenantId, id, { populate: true });

    if (!bundle) {
      return NextResponse.json({ success: false, error: t('validation.bundleNotFound', 'Bundle not found') }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: bundle });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error fetching bundle:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (!(await hasTenantPermission(user.role, tenantId, 'bundles.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();

    const patch: Patch<BundleInput> = {};
    if (body.name) patch.name = body.name;
    if (body.description !== undefined) patch.description = body.description;
    if (body.price !== undefined) patch.price = body.price;
    if (body.items) patch.items = body.items;
    if (body.sku !== undefined) patch.sku = body.sku;
    if (body.categoryId !== undefined) patch.categoryId = body.categoryId;
    if (body.image !== undefined) patch.image = body.image;
    if (body.trackInventory !== undefined) patch.trackInventory = body.trackInventory;
    if (body.isActive !== undefined) patch.isActive = body.isActive;

    const result = await getRepos().bundles.update(tenantId, id, patch);
    if (!result) {
      return NextResponse.json({ success: false, error: 'Bundle not found' }, { status: 404 });
    }

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'bundle',
      entityId: id,
      changes: { before: result.before, after: result.after },
    });

    return NextResponse.json({ success: true, data: result.after });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const t = await getValidationTranslatorFromRequest(request);
    if (isDuplicateKeyError(error)) {
      return NextResponse.json(
        { success: false, error: t('validation.bundleSkuExists', 'Bundle with this SKU already exists') },
        { status: 400 }
      );
    }
    logger.error('Error updating bundle:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    if (!(await hasTenantPermission(user.role, tenantId, 'bundles.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    // Soft delete - set isActive to false
    const result = await getRepos().bundles.update(tenantId, id, { isActive: false });
    if (!result) {
      return NextResponse.json({ success: false, error: t('validation.bundleNotFound', 'Bundle not found') }, { status: 404 });
    }

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.DELETE,
      entityType: 'bundle',
      entityId: id,
      changes: { name: result.after.name },
    });

    return NextResponse.json({ success: true, message: t('validation.bundleDeactivated', 'Bundle deactivated') });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error deleting bundle:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

