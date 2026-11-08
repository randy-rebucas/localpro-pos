import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ProductBundle from '@/models/ProductBundle';
import '@/models/Category'; // register schema for populate
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';
import { parseBundleInput } from '@/lib/bundle-input';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    const bundle = await ProductBundle.findOne({ _id: id, tenantId })
      .populate('items.productId', 'name price stock')
      .populate('categoryId', 'name')
      .lean();

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
    await connectDB();
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (!(await hasTenantPermission(user.role, tenantId, 'bundles.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const bundle = await ProductBundle.findOne({ _id: id, tenantId });
    if (!bundle) {
      return NextResponse.json({ success: false, error: 'Bundle not found' }, { status: 404 });
    }

    const t = await getValidationTranslatorFromRequest(request);
    const { allowed } = checkRateLimit(`write:bundles:${tenantId}:${user.userId}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    const body = await request.json();
    const oldData = bundle.toObject();

    const parsed = await parseBundleInput(body ?? {}, tenantId, t, { partial: true });
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }
    bundle.set(parsed.value.set);
    for (const field of parsed.value.unset) bundle.set(field, undefined);
    if (body?.isActive !== undefined) {
      if (typeof body.isActive !== 'boolean') {
        return NextResponse.json({ success: false, error: t('validation.invalidValue', 'Invalid value') }, { status: 400 });
      }
      bundle.isActive = body.isActive;
    }

    await bundle.save();

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'bundle',
      entityId: bundle._id.toString(),
      changes: { before: oldData, after: bundle.toObject() },
    });

    return NextResponse.json({ success: true, data: bundle });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const t = await getValidationTranslatorFromRequest(request);
    if (error.code === 11000) {
      return NextResponse.json(
        { success: false, error: t('validation.bundleSkuExists', 'Bundle with this SKU already exists') },
        { status: 400 }
      );
    }
    logger.error('Error updating bundle:', error);
    return NextResponse.json({ success: false, error: 'Failed to update bundle' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
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

    const bundle = await ProductBundle.findOne({ _id: id, tenantId });
    if (!bundle) {
      return NextResponse.json({ success: false, error: t('validation.bundleNotFound', 'Bundle not found') }, { status: 404 });
    }

    // Soft delete - set isActive to false
    bundle.isActive = false;
    await bundle.save();

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.DELETE,
      entityType: 'bundle',
      entityId: bundle._id.toString(),
      changes: { name: bundle.name },
    });

    return NextResponse.json({ success: true, message: t('validation.bundleDeactivated', 'Bundle deactivated') });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error deleting bundle:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

