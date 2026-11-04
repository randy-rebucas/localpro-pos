import { NextRequest, NextResponse } from 'next/server';
import { getRepos } from '@/lib/db';
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

    const tenant = await getRepos().tenants.findBySlug(slug, { activeOnly: true, select: 'settings.businessPermits' });
    if (!tenant) return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });

    if (user.role !== 'super_admin' && user.tenantId !== tenant._id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ success: true, data: tenant.settings?.businessPermits ?? {} });
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

    const tenant = await getRepos().tenants.findBySlug(slug, { select: 'settings.businessPermits' });
    if (!tenant) return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });

    if (user.role !== 'super_admin' && user.tenantId !== tenant._id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const dateFields = ['mayorsPermitExpiry', 'barangayClearanceExpiry', 'fsicExpiry', 'sanitaryPermitExpiry'];
    const stringFields = ['mayorsPermitNumber', 'barangayClearanceNumber', 'dtiSecRegistration', 'birCertificateOfRegistration', 'fireSafetyInspectionCertificate', 'sanitaryPermitNumber'];

    const bp: Record<string, unknown> = { ...tenant.settings?.businessPermits };

    for (const f of stringFields) {
      if (body[f] !== undefined) bp[f] = body[f] || undefined;
    }
    for (const f of dateFields) {
      if (body[f] !== undefined) bp[f] = body[f] ? new Date(body[f]) : undefined;
    }

    // Fields cleared above (undefined) are dropped, as save() did
    const updated = await getRepos().tenants.update(tenant._id, {
      set: { 'settings.businessPermits': Object.fromEntries(Object.entries(bp).filter(([, v]) => v !== undefined)) },
    });
    if (!updated) return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });

    await createAuditLog(request, {
      tenantId: tenant._id, userId: user.userId,
      action: AuditActions.UPDATE, entityType: 'business_permits',
      entityId: tenant._id, changes: body,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to update business permits');
  }
}
