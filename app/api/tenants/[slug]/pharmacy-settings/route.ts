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
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { slug } = await params;

    const tenant = await getTenantBySlug(slug);
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const settings = (tenant.settings as Record<string, any>) || {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({
      success: true,
      data: settings.pharmacyCompliance ?? {},
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

    const tenant = await getTenantBySlugAny(slug);
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    if (!(await hasTenantPermission(user.role, tenant.id, 'pharmacy_compliance.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const {
      pharmacistName, pharmacistPRCNumber, pharmacistPTRNumber,
      fdaLTO, fdaLTOExpiryDate, dohAccreditation,
      pdeaLicense, pdeaLicenseExpiry,
      requirePrescriptionForRx, trackExpiryDates, expiryAlertDays,
    } = body;

    const existingSettings = (tenant.settings as Record<string, any>) || {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    const pc: Record<string, any> = { ...(existingSettings.pharmacyCompliance || {}) }; // eslint-disable-line @typescript-eslint/no-explicit-any

    if (pharmacistName !== undefined) pc.pharmacistName = pharmacistName || undefined;
    if (pharmacistPRCNumber !== undefined) pc.pharmacistPRCNumber = pharmacistPRCNumber || undefined;
    if (pharmacistPTRNumber !== undefined) pc.pharmacistPTRNumber = pharmacistPTRNumber || undefined;
    if (fdaLTO !== undefined) pc.fdaLTO = fdaLTO || undefined;
    if (fdaLTOExpiryDate !== undefined) pc.fdaLTOExpiryDate = fdaLTOExpiryDate ? new Date(fdaLTOExpiryDate) : undefined;
    if (dohAccreditation !== undefined) pc.dohAccreditation = dohAccreditation || undefined;
    if (pdeaLicense !== undefined) pc.pdeaLicense = pdeaLicense || undefined;
    if (pdeaLicenseExpiry !== undefined) pc.pdeaLicenseExpiry = pdeaLicenseExpiry ? new Date(pdeaLicenseExpiry) : undefined;
    if (requirePrescriptionForRx !== undefined) pc.requirePrescriptionForRx = requirePrescriptionForRx;
    if (trackExpiryDates !== undefined) pc.trackExpiryDates = trackExpiryDates;
    if (expiryAlertDays !== undefined) pc.expiryAlertDays = Number(expiryAlertDays);

    const settings = { ...existingSettings, pharmacyCompliance: pc };
    await prisma.tenant.update({ where: { id: tenant.id }, data: { settings } });

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
