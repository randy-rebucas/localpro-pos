import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
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

    const settings = (tenant.settings as Record<string, any>) || {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: true, data: settings.serviceCompliance ?? {} });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to fetch service compliance');
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    if (!(await hasTenantPermission(user.role, user.tenantId, 'service_compliance.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const rl = checkRateLimit(`service-compliance:${user.userId}`, 20, 60_000);
    if (!rl.allowed) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    const { slug } = await params;

    const tenant = await getTenantBySlugAny(slug);
    if (!tenant) return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });

    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();

    const existingSettings = (tenant.settings as Record<string, any>) || {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    const sc: Record<string, any> = { ...(existingSettings.serviceCompliance || {}) }; // eslint-disable-line @typescript-eslint/no-explicit-any

    if (body.dohAccreditation !== undefined) sc.dohAccreditation = body.dohAccreditation || undefined;
    if (body.dohAccreditationExpiry !== undefined) sc.dohAccreditationExpiry = body.dohAccreditationExpiry ? new Date(body.dohAccreditationExpiry) : undefined;
    if (body.practitionerLicenses !== undefined) sc.practitionerLicenses = body.practitionerLicenses;

    const settings = { ...existingSettings, serviceCompliance: sc };
    await prisma.tenant.update({ where: { id: tenant.id }, data: { settings } });

    await createAuditLog(request, {
      tenantId: tenant.id, userId: user.userId,
      action: AuditActions.UPDATE, entityType: 'service_compliance',
      entityId: tenant.id, changes: body,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to update service compliance');
  }
}
