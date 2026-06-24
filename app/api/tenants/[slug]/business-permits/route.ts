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
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { slug } = await params;
    await connectDB();

    const tenant = await Tenant.findOne({ slug, isActive: true }).lean();
    if (!tenant) return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });

    if (user.role !== 'super_admin' && user.tenantId !== tenant._id.toString()) {
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

    if (!['admin', 'owner', 'super_admin'].includes(user.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const rl = checkRateLimit(`business-permits:${user.userId}`, 20, 60_000);
    if (!rl.allowed) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    const { slug } = await params;
    await connectDB();

    const tenant = await Tenant.findOne({ slug });
    if (!tenant) return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });

    if (user.role !== 'super_admin' && user.tenantId !== tenant._id.toString()) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const dateFields = ['mayorsPermitExpiry', 'barangayClearanceExpiry', 'fsicExpiry', 'sanitaryPermitExpiry'];
    const stringFields = ['mayorsPermitNumber', 'barangayClearanceNumber', 'dtiSecRegistration', 'birCertificateOfRegistration', 'fireSafetyInspectionCertificate', 'sanitaryPermitNumber'];

    if (!tenant.settings.businessPermits) tenant.settings.businessPermits = {} as never;
    const bp = tenant.settings.businessPermits as Record<string, unknown>;

    for (const f of stringFields) {
      if (body[f] !== undefined) bp[f] = body[f] || undefined;
    }
    for (const f of dateFields) {
      if (body[f] !== undefined) bp[f] = body[f] ? new Date(body[f]) : undefined;
    }

    tenant.markModified('settings');
    await tenant.save();

    await createAuditLog(request, {
      tenantId: tenant._id, userId: user.userId,
      action: AuditActions.UPDATE, entityType: 'business_permits',
      entityId: tenant._id.toString(), changes: body,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to update business permits');
  }
}
