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

function toGroupJSON(g: { id: string; _count?: { members: number }; [key: string]: unknown }) {
  return {
    ...g,
    _id: g.id,
    memberCount: g._count?.members ?? 0,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await requireTenantAccess(request);

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`read:customer-groups:${tenantId}:${ip}`, 60, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const searchParams = request.nextUrl.searchParams;
    const activeOnly = searchParams.get('activeOnly') === 'true';

    const where: Prisma.CustomerGroupWhereInput = { tenantId };
    if (activeOnly) {
      where.isActive = true;
    }

    const groups = await prisma.customerGroup.findMany({
      where,
      include: { _count: { select: { members: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: groups.map(toGroupJSON) });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch customer groups');
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId, user } = await requireTenantAccess(request);
    if (!(await hasTenantPermission(user.role, tenantId, 'customer_groups.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:customer-groups:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const t = await getValidationTranslatorFromRequest(request);
    const body = await request.json();
    const { name, description, isActive = true } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { success: false, error: t('validation.nameRequired', 'Name is required') },
        { status: 400 }
      );
    }
    if (name.length > 100) {
      return NextResponse.json({ success: false, error: 'Name must be 100 characters or less' }, { status: 400 });
    }
    if (description && typeof description === 'string' && description.length > 500) {
      return NextResponse.json({ success: false, error: 'Description must be 500 characters or less' }, { status: 400 });
    }

    const existing = await prisma.customerGroup.findFirst({ where: { tenantId, name: name.trim() } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: t('validation.customerGroupExists', 'A customer group with this name already exists') },
        { status: 400 }
      );
    }

    const group = await prisma.customerGroup.create({
      data: {
        id: randomUUID(),
        tenantId,
        name: name.trim(),
        description: description?.trim(),
        isActive,
      },
      include: { _count: { select: { members: true } } },
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.CREATE,
      entityType: 'customer_group',
      entityId: group.id,
      changes: { name, description },
    });

    return NextResponse.json({ success: true, data: toGroupJSON(group) }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const t = await getValidationTranslatorFromRequest(request);
      return NextResponse.json(
        { success: false, error: t('validation.customerGroupExists', 'A customer group with this name already exists') },
        { status: 400 }
      );
    }
    return handleApiError(error, 'Failed to create customer group');
  }
}
