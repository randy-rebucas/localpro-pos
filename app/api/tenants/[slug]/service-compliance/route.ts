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
    const tenant = await prisma.tenant.findFirst({
      where: { slug, isActive: true },
      include: { settings: true, practitionerLicenses: true },
    });
    if (!tenant) return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });

    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden') }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      data: {
        dohAccreditation: tenant.settings?.serviceDohAccreditation ?? undefined,
        dohAccreditationExpiry: tenant.settings?.serviceDohAccreditationExpiry ?? undefined,
        practitionerLicenses: tenant.practitionerLicenses.map((l) => ({
          id: l.id,
          name: l.name ?? undefined,
          licenseType: l.licenseType ?? undefined,
          prcNumber: l.prcNumber ?? undefined,
          ptrNumber: l.ptrNumber ?? undefined,
          licenseExpiry: l.licenseExpiry ?? undefined,
        })),
      },
    });
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
    const tenant = await prisma.tenant.findFirst({ where: { slug } });
    if (!tenant) return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });

    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden') }, { status: 403 });
    }

    const body = await request.json();

    const settingsData: Record<string, unknown> = {};
    if (body.dohAccreditation !== undefined) settingsData.serviceDohAccreditation = body.dohAccreditation || null;
    if (body.dohAccreditationExpiry !== undefined) {
      settingsData.serviceDohAccreditationExpiry = body.dohAccreditationExpiry ? new Date(body.dohAccreditationExpiry) : null;
    }

    await prisma.$transaction(async (tx) => {
      if (Object.keys(settingsData).length > 0) {
        await tx.tenantSettings.upsert({
          where: { tenantId: tenant.id },
          create: { tenantId: tenant.id, ...settingsData },
          update: settingsData,
        });
      }

      // Full-array replace of practitionerLicenses[], matching the previous
      // Mongoose shallow-assign semantics (caller sends the complete list).
      if (body.practitionerLicenses !== undefined) {
        await tx.tenantPractitionerLicense.deleteMany({ where: { tenantId: tenant.id } });
        const licenses = Array.isArray(body.practitionerLicenses) ? body.practitionerLicenses : [];
        if (licenses.length > 0) {
          await tx.tenantPractitionerLicense.createMany({
            data: licenses.map((l: { id?: string; name?: string; licenseType?: string; prcNumber?: string; ptrNumber?: string; licenseExpiry?: string }, idx: number) => ({
              id: l.id || `${tenant.id}_lic_${idx}_${Date.now()}`,
              tenantId: tenant.id,
              name: l.name ?? null,
              licenseType: l.licenseType ?? null,
              prcNumber: l.prcNumber ?? null,
              ptrNumber: l.ptrNumber ?? null,
              licenseExpiry: l.licenseExpiry ? new Date(l.licenseExpiry) : null,
            })),
          });
        }
      }
    });

    await createAuditLog(request, {
      tenantId: tenant.id, userId: user.userId,
      action: AuditActions.UPDATE, entityType: 'service_compliance',
      entityId: tenant.id, changes: body,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return handleApiError(error, t('validation.updateServiceComplianceFailed', 'Failed to update service compliance'));
  }
}
