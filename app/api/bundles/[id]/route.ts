import { NextRequest, NextResponse } from 'next/server';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';
import { getBundleById, updateBundle, setBundleActive } from '@/lib/data/bundles';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    const bundle = await getBundleById(tenantId, id);

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
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const oldData = await getBundleById(tenantId, id);
    if (!oldData) {
      return NextResponse.json({ success: false, error: 'Bundle not found' }, { status: 404 });
    }

    const body = await request.json();

    const updates: Record<string, unknown> = {};
    if (body.name) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.price !== undefined) updates.price = body.price;
    if (body.items) updates.items = body.items;
    if (body.sku !== undefined) updates.sku = body.sku;
    if (body.categoryId !== undefined) updates.categoryId = body.categoryId;
    if (body.image !== undefined) updates.image = body.image;
    if (body.trackInventory !== undefined) updates.trackInventory = body.trackInventory;
    if (body.isActive !== undefined) updates.isActive = body.isActive;

    const bundle = await updateBundle(tenantId, id, updates as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'bundle',
      entityId: id,
      changes: { before: oldData, after: bundle },
    });

    return NextResponse.json({ success: true, data: bundle });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const t = await getValidationTranslatorFromRequest(request);
    if (error.code === 'P2002') {
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
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    const bundle = await getBundleById(tenantId, id);
    if (!bundle) {
      return NextResponse.json({ success: false, error: t('validation.bundleNotFound', 'Bundle not found') }, { status: 404 });
    }

    // Soft delete - set isActive to false
    await setBundleActive(tenantId, id, false);

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.DELETE,
      entityType: 'bundle',
      entityId: id,
      changes: { name: bundle.name },
    });

    return NextResponse.json({ success: true, message: t('validation.bundleDeactivated', 'Bundle deactivated') });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error deleting bundle:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
