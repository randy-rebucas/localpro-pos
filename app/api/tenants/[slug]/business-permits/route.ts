import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { handleApiError } from '@/lib/error-handler';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';
import { getTenantBySlug, getTenantBySlugAny } from '@/lib/data/tenants';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { slug } = await params;

    const tenant = await getTenantBySlug(slug);
    if (!tenant) return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });

    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const settings = (tenant.settings as Record<string, unknown>) || {};
    return NextResponse.json({ success: true, data: settings.businessPermits ?? {} });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to fetch business permits');
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    if (!(await hasTenantPermission(user.role, user.tenantId, 'business_permits.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const rl = checkRateLimit(`business-permits:${user.userId}`, 20, 60_000);
    if (!rl.allowed) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    const { slug } = await params;

    const tenant = await getTenantBySlugAny(slug);
    if (!tenant) return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });

    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const dateFields = ['mayorsPermitExpiry', 'barangayClearanceExpiry', 'fsicExpiry', 'sanitaryPermitExpiry'];
    const stringFields = ['mayorsPermitNumber', 'barangayClearanceNumber', 'dtiSecRegistration', 'birCertificateOfRegistration', 'fireSafetyInspectionCertificate', 'sanitaryPermitNumber'];

    const existingSettings = (tenant.settings as Record<string, unknown>) || {};
    const bp = { ...(existingSettings.businessPermits as Record<string, unknown> || {}) };

    for (const f of stringFields) {
      if (body[f] !== undefined) bp[f] = body[f] || undefined;
    }
    for (const f of dateFields) {
      if (body[f] !== undefined) bp[f] = body[f] ? new Date(body[f]).toISOString() : undefined;
    }

    const settings = { ...existingSettings, businessPermits: bp };
    await prisma.tenant.update({ where: { id: tenant.id }, data: { settings: settings as Prisma.InputJsonValue } });

    await createAuditLog(request, {
      tenantId: tenant.id, userId: user.userId,
      action: AuditActions.UPDATE, entityType: 'business_permits',
      entityId: tenant.id, changes: body,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to update business permits');
  }
}
