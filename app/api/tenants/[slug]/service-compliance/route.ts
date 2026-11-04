import { NextRequest, NextResponse } from 'next/server';
import { getRepos } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { handleApiError } from '@/lib/error-handler';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const t = await getValidationTranslatorFromRequest(request);
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ success: false, error: t('validation.unauthorized', 'Unauthorized') }, { status: 401 });

    const { slug } = await params;

    const tenant = await getRepos().tenants.findBySlug(slug, { activeOnly: true, select: 'settings.serviceCompliance' });
    if (!tenant) return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });

    if (user.role !== 'super_admin' && user.tenantId !== tenant._id) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden') }, { status: 403 });
    }

    return NextResponse.json({ success: true, data: tenant.settings?.serviceCompliance ?? {} });
  } catch (error: unknown) {
    return handleApiError(error, t('validation.fetchServiceComplianceFailed', 'Failed to fetch service compliance'));
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const t = await getValidationTranslatorFromRequest(request);
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ success: false, error: t('validation.unauthorized', 'Unauthorized') }, { status: 401 });

    if (!(await hasTenantPermission(user.role, user.tenantId, 'service_compliance.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden') }, { status: 403 });
    }

    const rl = checkRateLimit(`service-compliance:${user.userId}`, 20, 60_000);
    if (!rl.allowed) return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });

    const { slug } = await params;

    const tenant = await getRepos().tenants.findBySlug(slug, { select: 'settings.serviceCompliance' });
    if (!tenant) return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });

    if (user.role !== 'super_admin' && user.tenantId !== tenant._id) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden') }, { status: 403 });
    }

    const body = await request.json();

    const sc: Record<string, unknown> = { ...tenant.settings?.serviceCompliance };

    if (body.dohAccreditation !== undefined) sc.dohAccreditation = body.dohAccreditation || undefined;
    if (body.dohAccreditationExpiry !== undefined) sc.dohAccreditationExpiry = body.dohAccreditationExpiry ? new Date(body.dohAccreditationExpiry) : undefined;
    if (body.practitionerLicenses !== undefined) sc.practitionerLicenses = body.practitionerLicenses;

    // Fields cleared above (undefined) are dropped, as save() did
    const updated = await getRepos().tenants.update(tenant._id, {
      set: { 'settings.serviceCompliance': Object.fromEntries(Object.entries(sc).filter(([, v]) => v !== undefined)) },
    });
    if (!updated) return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });

    await createAuditLog(request, {
      tenantId: tenant._id, userId: user.userId,
      action: AuditActions.UPDATE, entityType: 'service_compliance',
      entityId: tenant._id, changes: body,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return handleApiError(error, t('validation.updateServiceComplianceFailed', 'Failed to update service compliance'));
  }
}
