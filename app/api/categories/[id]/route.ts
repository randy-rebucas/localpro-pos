import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
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

    const category = await prisma.category.findFirst({ where: { id, tenantId } });

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

    const category = await prisma.category.findFirst({ where: { id, tenantId } });
    if (!category) {
      return NextResponse.json({ success: false, error: t('validation.categoryNotFound', 'Category not found') }, { status: 404 });
    }

    const body = await request.json();
    const { data, errors } = validateAndSanitize(body, validateCategory, t);

    if (errors.length > 0) {
      return NextResponse.json(
        { success: false, errors },
        { status: 400 }
      );
    }

    const oldData = category;

    const updateData: Prisma.CategoryUpdateInput = {};
    if (Object.prototype.hasOwnProperty.call(data, 'name') && typeof data.name === 'string') updateData.name = data.name;
    if (Object.prototype.hasOwnProperty.call(data, 'description') && (typeof data.description === 'string' || typeof data.description === 'undefined')) updateData.description = data.description;
    if (Object.prototype.hasOwnProperty.call(data, 'isActive') && typeof data.isActive === 'boolean') updateData.isActive = data.isActive;

    const updated = await prisma.category.update({ where: { id }, data: updateData });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'category',
      entityId: updated.id,
      changes: { before: oldData, after: updated },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
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

    const category = await prisma.category.findFirst({ where: { id, tenantId } });
    if (!category) {
      return NextResponse.json({ success: false, error: t('validation.categoryNotFound', 'Category not found') }, { status: 404 });
    }

    // Soft delete - set isActive to false
    const updated = await prisma.category.update({ where: { id }, data: { isActive: false } });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.DELETE,
      entityType: 'category',
      entityId: updated.id,
      changes: { name: updated.name },
    });

    return NextResponse.json({ success: true, message: t('validation.categoryDeactivated', 'Category deactivated') });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
