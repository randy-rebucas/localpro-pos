import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { getCurrentUser } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';

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
    await connectDB();

    const tenant = await Tenant.findOne({ slug, isActive: true }).lean();
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant._id.toString()) {
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

    if (user.role !== 'admin' && user.role !== 'owner' && user.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const rl = checkRateLimit(`pharmacy-settings:${user.userId}`, 20, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const { slug } = await params;
    await connectDB();

    const tenant = await Tenant.findOne({ slug });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant._id.toString()) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const {
      pharmacistName, pharmacistPRCNumber, pharmacistPTRNumber,
      fdaLTO, fdaLTOExpiryDate, dohAccreditation,
      pdeaLicense, pdeaLicenseExpiry,
      requirePrescriptionForRx, trackExpiryDates, expiryAlertDays,
    } = body;

    if (!tenant.settings.pharmacyCompliance) {
      tenant.settings.pharmacyCompliance = {} as never;
    }

    const pc = tenant.settings.pharmacyCompliance as Record<string, unknown>;
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

    tenant.markModified('settings');
    await tenant.save();

    await createAuditLog(request, {
      tenantId: tenant._id,
      userId: user.userId,
      action: AuditActions.PHARMACY_SETTINGS_UPDATE,
      entityType: 'pharmacy_settings',
      entityId: tenant._id.toString(),
      changes: body,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to update pharmacy settings');
  }
}
