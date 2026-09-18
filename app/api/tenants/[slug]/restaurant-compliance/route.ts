import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
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
    const tenant = await prisma.tenant.findFirst({ where: { slug, isActive: true }, include: { settings: true } });
    if (!tenant) return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });

    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden') }, { status: 403 });
    }

    const s = tenant.settings;
    return NextResponse.json({
      success: true,
      data: {
        fdaFoodBusinessLicense: s?.fdaFoodBusinessLicense ?? undefined,
        fdaFblExpiry: s?.fdaFblExpiry ?? undefined,
        foodSafetyCertificateNumber: s?.foodSafetyCertificateNumber ?? undefined,
        foodSafetyCertificateExpiry: s?.foodSafetyCertificateExpiry ?? undefined,
        foodHandlersCertified: s?.foodHandlersCertified ?? undefined,
        numberOfCertifiedHandlers: s?.numberOfCertifiedHandlers ?? undefined,
        healthCertificateExpiry: s?.healthCertificateExpiry ?? undefined,
        kitchenSanitationCompliant: s?.kitchenSanitationCompliant ?? undefined,
      },
    });
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
    const tenant = await prisma.tenant.findFirst({ where: { slug } });
    if (!tenant) return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });

    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden') }, { status: 403 });
    }

    const body = await request.json();
    const dateFields = ['fdaFblExpiry', 'foodSafetyCertificateExpiry', 'healthCertificateExpiry'];
    const stringFields = ['fdaFoodBusinessLicense', 'foodSafetyCertificateNumber'];
    const boolFields = ['foodHandlersCertified', 'kitchenSanitationCompliant'];

    const data: Record<string, unknown> = {};
    for (const f of stringFields) { if (body[f] !== undefined) data[f] = body[f] || null; }
    for (const f of dateFields) { if (body[f] !== undefined) data[f] = body[f] ? new Date(body[f]) : null; }
    for (const f of boolFields) { if (body[f] !== undefined) data[f] = body[f]; }
    if (body.numberOfCertifiedHandlers !== undefined) data.numberOfCertifiedHandlers = Number(body.numberOfCertifiedHandlers);

    await prisma.tenantSettings.upsert({
      where: { tenantId: tenant.id },
      create: { tenantId: tenant.id, ...data },
      update: data,
    });

    await createAuditLog(request, {
      tenantId: tenant.id, userId: user.userId,
      action: AuditActions.UPDATE, entityType: 'restaurant_compliance',
      entityId: tenant.id, changes: body,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return handleApiError(error, t('validation.updateRestaurantComplianceFailed', 'Failed to update restaurant compliance'));
  }
}
