import { NextRequest, NextResponse } from 'next/server';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { validateAndSanitize, validateCategory } from '@/lib/validation';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { getCategoryById, updateCategory } from '@/lib/data/categories';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const category = await getCategoryById(tenantId, id);

    if (!category) {
      return NextResponse.json({ success: false, error: 'Category not found' }, { status: 404 });
    }

    const { id: catId, ...rest } = category;
    return NextResponse.json({ success: true, data: { _id: catId, ...rest } });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
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

    const category = await getCategoryById(tenantId, id);
    if (!category) {
      return NextResponse.json({ success: false, error: 'Category not found' }, { status: 404 });
    }

    const body = await request.json();
    const t = await getValidationTranslatorFromRequest(request);
    const { data, errors } = validateAndSanitize(body, validateCategory, t);

    if (errors.length > 0) {
      return NextResponse.json(
        { success: false, errors },
        { status: 400 }
      );
    }

    const oldData = category;

    const updates: Partial<{ name: string; description: string | undefined; isActive: boolean }> = {};
    if (Object.prototype.hasOwnProperty.call(data, 'name') && typeof data.name === 'string') updates.name = data.name;
    if (Object.prototype.hasOwnProperty.call(data, 'description') && (typeof data.description === 'string' || typeof data.description === 'undefined')) updates.description = data.description;
    if (Object.prototype.hasOwnProperty.call(data, 'isActive') && typeof data.isActive === 'boolean') updates.isActive = data.isActive;

    const updated = await updateCategory(tenantId, id, updates);

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'category',
      entityId: id,
      changes: { before: oldData, after: updated },
    });

    const { id: catId, ...rest } = updated;
    return NextResponse.json({ success: true, data: { _id: catId, ...rest } });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (error.code === 'P2002') {
      return NextResponse.json(
        { success: false, error: 'Category with this name already exists' },
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
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const category = await getCategoryById(tenantId, id);
    if (!category) {
      return NextResponse.json({ success: false, error: 'Category not found' }, { status: 404 });
    }

    // Soft delete - set isActive to false
    await updateCategory(tenantId, id, { isActive: false });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.DELETE,
      entityType: 'category',
      entityId: id,
      changes: { name: category.name },
    });

    return NextResponse.json({ success: true, message: 'Category deactivated' });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
