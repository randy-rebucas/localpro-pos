import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { handleApiError } from '@/lib/error-handler';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { slug } = await params;
    const tenant = await prisma.tenant.findFirst({ where: { slug, isActive: true }, include: { settings: true } });
    if (!tenant) return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });

    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const s = tenant.settings;
    return NextResponse.json({
      success: true,
      data: {
        mayorsPermitNumber: s?.mayorsPermitNumber ?? undefined,
        mayorsPermitExpiry: s?.mayorsPermitExpiry ?? undefined,
        barangayClearanceNumber: s?.barangayClearanceNumber ?? undefined,
        barangayClearanceExpiry: s?.barangayClearanceExpiry ?? undefined,
        dtiSecRegistration: s?.dtiSecRegistration ?? undefined,
        birCertificateOfRegistration: s?.birCertificateOfRegistration ?? undefined,
        fireSafetyInspectionCertificate: s?.fireSafetyInspectionCertificate ?? undefined,
        fsicExpiry: s?.fsicExpiry ?? undefined,
        sanitaryPermitNumber: s?.sanitaryPermitNumber ?? undefined,
        sanitaryPermitExpiry: s?.sanitaryPermitExpiry ?? undefined,
      },
    });
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
    const tenant = await prisma.tenant.findFirst({ where: { slug } });
    if (!tenant) return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });

    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const dateFields = ['mayorsPermitExpiry', 'barangayClearanceExpiry', 'fsicExpiry', 'sanitaryPermitExpiry'];
    const stringFields = ['mayorsPermitNumber', 'barangayClearanceNumber', 'dtiSecRegistration', 'birCertificateOfRegistration', 'fireSafetyInspectionCertificate', 'sanitaryPermitNumber'];

    const data: Record<string, unknown> = {};
    for (const f of stringFields) {
      if (body[f] !== undefined) data[f] = body[f] || null;
    }
    for (const f of dateFields) {
      if (body[f] !== undefined) data[f] = body[f] ? new Date(body[f]) : null;
    }

    await prisma.tenantSettings.upsert({
      where: { tenantId: tenant.id },
      create: { tenantId: tenant.id, ...data },
      update: data,
    });

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
