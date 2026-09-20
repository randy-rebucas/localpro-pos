import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/db';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    const { customerId } = body;
    if (!customerId || typeof customerId !== 'string') {
      return NextResponse.json({ success: false, error: 'customerId is required' }, { status: 400 });
    }

    const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId } });
    if (!customer) {
      return NextResponse.json({ success: false, error: t('validation.customerNotFound', 'Customer not found') }, { status: 404 });
    }

    const existing = await prisma.customerGroupMember.findUnique({
      where: { groupId_customerId: { groupId: id, customerId } },
    });
    if (existing) {
      return NextResponse.json({ success: false, error: 'Customer is already in this group' }, { status: 400 });
    }

    const member = await prisma.customerGroupMember.create({
      data: { id: randomUUID(), groupId: id, customerId },
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'customer_group',
      entityId: id,
      changes: { addedCustomerId: customerId },
    });

    return NextResponse.json({ success: true, data: { _id: member.id, customerId, groupId: id } }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Failed to add customer to group');
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

    const customerId = request.nextUrl.searchParams.get('customerId');
    if (!customerId) {
      return NextResponse.json({ success: false, error: 'customerId is required' }, { status: 400 });
    }

    await prisma.customerGroupMember.deleteMany({ where: { groupId: id, customerId } });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'customer_group',
      entityId: id,
      changes: { removedCustomerId: customerId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Failed to remove customer from group');
  }
}
