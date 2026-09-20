import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';

function toSupplierJSON(s: { id: string; [key: string]: unknown }) {
  return { ...s, _id: s.id };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireTenantAccess(request);
    const { id } = await params;

    const supplier = await prisma.supplier.findFirst({ where: { id, tenantId } });
    if (!supplier) {
      return NextResponse.json({ success: false, error: 'Supplier not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: toSupplierJSON(supplier) });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch supplier');
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, user } = await requireTenantAccess(request);
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    if (!(await hasTenantPermission(user.role, tenantId, 'suppliers.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:suppliers:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    const supplier = await prisma.supplier.findFirst({ where: { id, tenantId } });
    if (!supplier) {
      return NextResponse.json({ success: false, error: 'Supplier not found' }, { status: 404 });
    }

    const body = await request.json();
    const updates: Prisma.SupplierUpdateInput = {};

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        return NextResponse.json({ success: false, error: 'Supplier name is required' }, { status: 400 });
      }
      if (body.name.length > 150) {
        return NextResponse.json({ success: false, error: 'Name must be 150 characters or less' }, { status: 400 });
      }
      updates.name = body.name.trim();
    }
    if (body.contactName !== undefined) updates.contactName = body.contactName;
    if (body.phone !== undefined) updates.phone = body.phone;
    if (body.email !== undefined) updates.email = body.email;
    if (body.address !== undefined) updates.address = body.address;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.isActive !== undefined) updates.isActive = body.isActive;

    const updated = await prisma.supplier.update({ where: { id: supplier.id }, data: updates });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'supplier',
      entityId: id,
      changes: updates,
    });

    return NextResponse.json({ success: true, data: toSupplierJSON(updated) });
  } catch (error) {
    return handleApiError(error, 'Failed to update supplier');
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, user } = await requireTenantAccess(request);
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    if (!(await hasTenantPermission(user.role, tenantId, 'suppliers.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:suppliers:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    const supplier = await prisma.supplier.findFirst({ where: { id, tenantId } });
    if (!supplier) {
      return NextResponse.json({ success: false, error: 'Supplier not found' }, { status: 404 });
    }

    const poCount = await prisma.purchaseOrder.count({ where: { supplierId: supplier.id, tenantId } });
    if (poCount > 0) {
      return NextResponse.json(
        { success: false, error: `Cannot delete supplier "${supplier.name}": it has ${poCount} purchase order(s). Deactivate it instead.` },
        { status: 400 }
      );
    }

    await prisma.supplier.delete({ where: { id: supplier.id } });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.DELETE,
      entityType: 'supplier',
      entityId: id,
      changes: { name: supplier.name },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Failed to delete supplier');
  }
}
