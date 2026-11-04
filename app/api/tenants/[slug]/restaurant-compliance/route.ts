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

    const tenant = await getRepos().tenants.findBySlug(slug, { activeOnly: true, select: 'settings.restaurantCompliance' });
    if (!tenant) return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });

    if (user.role !== 'super_admin' && user.tenantId !== tenant._id) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden') }, { status: 403 });
    }

    return NextResponse.json({ success: true, data: tenant.settings?.restaurantCompliance ?? {} });
  } catch (error: unknown) {
    return handleApiError(error, t('validation.fetchRestaurantComplianceFailed', 'Failed to fetch restaurant compliance'));
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

    if (!(await hasTenantPermission(user.role, user.tenantId, 'restaurant_compliance.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden') }, { status: 403 });
    }

    const rl = checkRateLimit(`restaurant-compliance:${user.userId}`, 20, 60_000);
    if (!rl.allowed) return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });

    const { slug } = await params;

    const tenant = await getRepos().tenants.findBySlug(slug, { select: 'settings.restaurantCompliance' });
    if (!tenant) return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });

    if (user.role !== 'super_admin' && user.tenantId !== tenant._id) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden') }, { status: 403 });
    }

    const body = await request.json();
    const dateFields = ['fdaFblExpiry', 'foodSafetyCertificateExpiry', 'healthCertificateExpiry'];
    const stringFields = ['fdaFoodBusinessLicense', 'foodSafetyCertificateNumber'];
    const boolFields = ['foodHandlersCertified', 'kitchenSanitationCompliant'];

    const rc: Record<string, unknown> = { ...tenant.settings?.restaurantCompliance };

    for (const f of stringFields) { if (body[f] !== undefined) rc[f] = body[f] || undefined; }
    for (const f of dateFields) { if (body[f] !== undefined) rc[f] = body[f] ? new Date(body[f]) : undefined; }
    for (const f of boolFields) { if (body[f] !== undefined) rc[f] = body[f]; }
    if (body.numberOfCertifiedHandlers !== undefined) rc.numberOfCertifiedHandlers = Number(body.numberOfCertifiedHandlers);

    // Fields cleared above (undefined) are dropped, as save() did
    const updated = await getRepos().tenants.update(tenant._id, {
      set: { 'settings.restaurantCompliance': Object.fromEntries(Object.entries(rc).filter(([, v]) => v !== undefined)) },
    });
    if (!updated) return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });

    await createAuditLog(request, {
      tenantId: tenant._id, userId: user.userId,
      action: AuditActions.UPDATE, entityType: 'restaurant_compliance',
      entityId: tenant._id, changes: body,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return handleApiError(error, t('validation.updateRestaurantComplianceFailed', 'Failed to update restaurant compliance'));
  }
}
