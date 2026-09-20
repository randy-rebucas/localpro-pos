import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';

function toGroupJSON(g: { id: string; _count?: { members: number }; [key: string]: unknown }) {
  return {
    ...g,
    _id: g.id,
    memberCount: g._count?.members ?? 0,
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireTenantAccess(request);
    const { id } = await params;

    const group = await prisma.customerGroup.findFirst({
      where: { id, tenantId },
      include: {
        _count: { select: { members: true } },
        members: { include: { customer: { select: { id: true, firstName: true, lastName: true, email: true } } } },
      },
    });
    if (!group) {
      return NextResponse.json({ success: false, error: 'Customer group not found' }, { status: 404 });
    }

    const { members, ...rest } = group;
    return NextResponse.json({
      success: true,
      data: {
        ...toGroupJSON(rest),
        members: members.map((m) => ({ _id: m.customer.id, ...m.customer })),
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch customer group');
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, user } = await requireTenantAccess(request);
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    if (!(await hasTenantPermission(user.role, tenantId, 'customer_groups.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:customer-groups:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const group = await prisma.customerGroup.findFirst({ where: { id, tenantId } });
    if (!group) {
      return NextResponse.json({ success: false, error: t('validation.customerGroupNotFound', 'Customer group not found') }, { status: 404 });
    }

    const body = await request.json();
    const updates: Prisma.CustomerGroupUpdateInput = {};

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        return NextResponse.json({ success: false, error: t('validation.nameRequired', 'Name is required') }, { status: 400 });
      }
      if (body.name.length > 100) {
        return NextResponse.json({ success: false, error: 'Name must be 100 characters or less' }, { status: 400 });
      }
      updates.name = body.name.trim();
    }
    if (body.description !== undefined) {
      if (typeof body.description === 'string' && body.description.length > 500) {
        return NextResponse.json({ success: false, error: 'Description must be 500 characters or less' }, { status: 400 });
      }
      updates.description = body.description;
    }
    if (body.isActive !== undefined) updates.isActive = body.isActive;

    const updated = await prisma.customerGroup.update({
      where: { id: group.id },
      data: updates,
      include: { _count: { select: { members: true } } },
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'customer_group',
      entityId: id,
      changes: updates,
    });

    return NextResponse.json({ success: true, data: toGroupJSON(updated) });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const t = await getValidationTranslatorFromRequest(request);
      return NextResponse.json(
        { success: false, error: t('validation.customerGroupExists', 'A customer group with this name already exists') },
        { status: 400 }
      );
    }
    return handleApiError(error, 'Failed to update customer group');
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, user } = await requireTenantAccess(request);
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    if (!(await hasTenantPermission(user.role, tenantId, 'customer_groups.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:customer-groups:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const group = await prisma.customerGroup.findFirst({ where: { id, tenantId } });
    if (!group) {
      return NextResponse.json({ success: false, error: t('validation.customerGroupNotFound', 'Customer group not found') }, { status: 404 });
    }

    await prisma.customerGroup.delete({ where: { id: group.id } });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.DELETE,
      entityType: 'customer_group',
      entityId: id,
      changes: { name: group.name },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Failed to delete customer group');
  }
}
