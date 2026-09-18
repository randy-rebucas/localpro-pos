import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { handleApiError } from '@/lib/error-handler';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';
import { checkPharmacyFeatureAccess } from '@/lib/subscription';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { slug } = await params;
    const tenant = await prisma.tenant.findFirst({ where: { slug, isActive: true }, include: { settings: true } });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const s = tenant.settings;
    return NextResponse.json({
      success: true,
      data: {
        pharmacistName: s?.pharmacistName ?? undefined,
        pharmacistPRCNumber: s?.pharmacistPRCNumber ?? undefined,
        pharmacistPTRNumber: s?.pharmacistPTRNumber ?? undefined,
        fdaLTO: s?.fdaLTO ?? undefined,
        fdaLTOExpiryDate: s?.fdaLTOExpiryDate ?? undefined,
        dohAccreditation: s?.pharmacyDohAccreditation ?? undefined,
        pdeaLicense: s?.pdeaLicense ?? undefined,
        pdeaLicenseExpiry: s?.pdeaLicenseExpiry ?? undefined,
        requirePrescriptionForRx: s?.requirePrescriptionForRx ?? undefined,
        trackExpiryDates: s?.trackExpiryDates ?? undefined,
        expiryAlertDays: s?.expiryAlertDays ?? undefined,
      },
    });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to fetch pharmacy settings');
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = checkRateLimit(`pharmacy-settings:${user.userId}`, 20, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const { slug } = await params;
    const tenant = await prisma.tenant.findFirst({ where: { slug } });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    if (!(await hasTenantPermission(user.role, tenant.id, 'pharmacy_compliance.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    try {
      await checkPharmacyFeatureAccess(tenant.id, 'enablePharmacyCompliance');
    } catch (featureError: unknown) {
      return NextResponse.json(
        { success: false, error: featureError instanceof Error ? featureError.message : 'Feature not available' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      pharmacistName, pharmacistPRCNumber, pharmacistPTRNumber,
      fdaLTO, fdaLTOExpiryDate, dohAccreditation,
      pdeaLicense, pdeaLicenseExpiry,
      requirePrescriptionForRx, trackExpiryDates, expiryAlertDays,
    } = body;

    const data: Record<string, unknown> = {};
    if (pharmacistName !== undefined) data.pharmacistName = pharmacistName || null;
    if (pharmacistPRCNumber !== undefined) data.pharmacistPRCNumber = pharmacistPRCNumber || null;
    if (pharmacistPTRNumber !== undefined) data.pharmacistPTRNumber = pharmacistPTRNumber || null;
    if (fdaLTO !== undefined) data.fdaLTO = fdaLTO || null;
    if (fdaLTOExpiryDate !== undefined) data.fdaLTOExpiryDate = fdaLTOExpiryDate ? new Date(fdaLTOExpiryDate) : null;
    // Note: source field is Mongoose `settings.pharmacyCompliance.dohAccreditation`;
    // Prisma column is `pharmacyDohAccreditation` (see prisma/schema.prisma).
    if (dohAccreditation !== undefined) data.pharmacyDohAccreditation = dohAccreditation || null;
    if (pdeaLicense !== undefined) data.pdeaLicense = pdeaLicense || null;
    if (pdeaLicenseExpiry !== undefined) data.pdeaLicenseExpiry = pdeaLicenseExpiry ? new Date(pdeaLicenseExpiry) : null;
    if (requirePrescriptionForRx !== undefined) data.requirePrescriptionForRx = requirePrescriptionForRx;
    if (trackExpiryDates !== undefined) data.trackExpiryDates = trackExpiryDates;
    if (expiryAlertDays !== undefined) data.expiryAlertDays = Number(expiryAlertDays);

    await prisma.tenantSettings.upsert({
      where: { tenantId: tenant.id },
      create: { tenantId: tenant.id, ...data },
      update: data,
    });

    await createAuditLog(request, {
      tenantId: tenant.id,
      userId: user.userId,
      action: AuditActions.PHARMACY_SETTINGS_UPDATE,
      entityType: 'pharmacy_settings',
      entityId: tenant.id,
      changes: body,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to update pharmacy settings');
  }
}
