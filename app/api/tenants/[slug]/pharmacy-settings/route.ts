import { NextRequest, NextResponse } from 'next/server';
import { getRepos } from '@/lib/db';
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

    const tenant = await getRepos().tenants.findBySlug(slug, { activeOnly: true, select: 'settings.pharmacyCompliance' });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant._id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      data: tenant.settings?.pharmacyCompliance ?? {},
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

    const tenant = await getRepos().tenants.findBySlug(slug, { select: 'settings.pharmacyCompliance' });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant._id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    if (!(await hasTenantPermission(user.role, tenant._id, 'pharmacy_compliance.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    try {
      await checkPharmacyFeatureAccess(tenant._id, 'enablePharmacyCompliance');
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

    const pc: Record<string, unknown> = { ...tenant.settings?.pharmacyCompliance };
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

    // Fields cleared above (undefined) are dropped, as save() did
    const updated = await getRepos().tenants.update(tenant._id, {
      set: { 'settings.pharmacyCompliance': Object.fromEntries(Object.entries(pc).filter(([, v]) => v !== undefined)) },
    });
    if (!updated) return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });

    await createAuditLog(request, {
      tenantId: tenant._id,
      userId: user.userId,
      action: AuditActions.PHARMACY_SETTINGS_UPDATE,
      entityType: 'pharmacy_settings',
      entityId: tenant._id,
      changes: body,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to update pharmacy settings');
  }
}
