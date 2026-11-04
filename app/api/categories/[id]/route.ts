import { NextRequest, NextResponse } from 'next/server';
import { getRepos, isDuplicateKeyError } from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { validateAndSanitize, validateCategory } from '@/lib/validation';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const t = await getValidationTranslatorFromRequest(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    const category = await getRepos().categories.findById(tenantId, id);

    if (!category) {
      return NextResponse.json({ success: false, error: t('validation.categoryNotFound', 'Category not found') }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: category });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (error.message?.includes('Unauthorized')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
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
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    if (!(await hasTenantPermission(user.role, tenantId, 'categories.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const { id } = await params;

    const body = await request.json();
    const { data, errors } = validateAndSanitize(body, validateCategory, t);

    if (errors.length > 0) {
      return NextResponse.json(
        { success: false, errors },
        { status: 400 }
      );
    }

    const result = await getRepos().categories.update(tenantId, id, {
      name: typeof data.name === 'string' ? data.name : undefined,
      description: typeof data.description === 'string' ? data.description : undefined,
      isActive: typeof data.isActive === 'boolean' ? data.isActive : undefined,
    });
    if (!result) {
      return NextResponse.json({ success: false, error: t('validation.categoryNotFound', 'Category not found') }, { status: 404 });
    }
    const category = result.after;

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'category',
      entityId: category._id,
      changes: { before: result.before, after: result.after },
    });

    return NextResponse.json({ success: true, data: category });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (isDuplicateKeyError(error)) {
      const t = await getValidationTranslatorFromRequest(request);
      return NextResponse.json(
        { success: false, error: t('validation.categoryNameExists', 'Category with this name already exists') },
        { status: 400 }
      );
    }
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
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    if (!(await hasTenantPermission(user.role, tenantId, 'categories.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const { id } = await params;

    // Soft delete - set isActive to false
    const result = await getRepos().categories.update(tenantId, id, { isActive: false });
    if (!result) {
      return NextResponse.json({ success: false, error: t('validation.categoryNotFound', 'Category not found') }, { status: 404 });
    }

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.DELETE,
      entityType: 'category',
      entityId: result.after._id,
      changes: { name: result.after.name },
    });

    return NextResponse.json({ success: true, message: t('validation.categoryDeactivated', 'Category deactivated') });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

