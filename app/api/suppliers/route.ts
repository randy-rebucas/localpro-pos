import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { requireSuppliersAccess } from '@/lib/suppliers-access';

function toSupplierJSON(s: { id: string; [key: string]: unknown }) {
  return { ...s, _id: s.id };
}

export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await requireTenantAccess(request);

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`read:suppliers:${tenantId}:${ip}`, 60, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const activeOnly = request.nextUrl.searchParams.get('activeOnly') === 'true';
    const where: Prisma.SupplierWhereInput = { tenantId };
    if (activeOnly) where.isActive = true;

    const suppliers = await prisma.supplier.findMany({ where, orderBy: { name: 'asc' } });

    return NextResponse.json({ success: true, data: suppliers.map(toSupplierJSON) });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch suppliers');
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId, user } = await requireTenantAccess(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!(await hasTenantPermission(user.role, tenantId, 'suppliers.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    try {
      await requireSuppliersAccess(tenantId);
    } catch (featureError: unknown) {
      const msg = featureError instanceof Error ? featureError.message : 'Forbidden';
      return NextResponse.json({ success: false, error: msg }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:suppliers:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    const body = await request.json();
    const { name, contactName, phone, email, address, notes, isActive = true } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { success: false, error: t('validation.missingRequiredFields', 'Supplier name is required') },
        { status: 400 }
      );
    }
    if (name.length > 150) {
      return NextResponse.json({ success: false, error: 'Name must be 150 characters or less' }, { status: 400 });
    }

    const supplier = await prisma.supplier.create({
      data: {
        id: randomUUID(),
        tenantId,
        name: name.trim(),
        contactName: contactName || undefined,
        phone: phone || undefined,
        email: email || undefined,
        address: address || undefined,
        notes: notes || undefined,
        isActive,
      },
    });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.CREATE,
      entityType: 'supplier',
      entityId: supplier.id,
      changes: { name },
    });

    return NextResponse.json({ success: true, data: toSupplierJSON(supplier) }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Failed to create supplier');
  }
}
