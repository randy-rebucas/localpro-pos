/**
 * Daily Report Recipients API
 * GET/PUT who receives the owner's daily sales report. These are personal contact
 * details, so they live here rather than in the publicly readable tenant settings.
 */

import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { handleApiError } from '@/lib/error-handler';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_FORMAT = /^\+[1-9]\d{7,14}$/;

type AuthedUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** The tenant, or the response refusing this user access to it. */
async function loadTenant(user: AuthedUser, slug: string) {
  const tenant = await Tenant.findOne({ slug }).select('_id dailyReport').lean();
  if (!tenant) {
    return { denied: NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 }) };
  }
  const tenantId = tenant._id.toString();
  if (user.role !== 'super_admin' && user.tenantId !== tenantId) {
    return { denied: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }) };
  }
  if (!(await hasTenantPermission(user.role, tenantId, 'settings.manage'))) {
    return { denied: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }) };
  }
  return { tenant };
}

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

    const { tenant, denied } = await loadTenant(user, slug);
    if (denied) return denied;

    return NextResponse.json({
      success: true,
      data: { email: tenant.dailyReport?.email ?? '', phone: tenant.dailyReport?.phone ?? '' },
    });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to fetch daily report recipients');
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

    const rl = checkRateLimit(`daily-report:${user.userId}`, 20, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const { slug } = await params;
    await connectDB();

    const { tenant, denied } = await loadTenant(user, slug);
    if (denied) return denied;

    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const phone = typeof body.phone === 'string' ? body.phone.replace(/[\s()-]/g, '') : '';

    if (email && !EMAIL_FORMAT.test(email)) {
      return NextResponse.json({ success: false, error: 'Enter a valid email address' }, { status: 400 });
    }
    if (phone && !PHONE_FORMAT.test(phone)) {
      return NextResponse.json(
        { success: false, error: 'Enter the mobile number in international format, such as +639171234567' },
        { status: 400 }
      );
    }

    await Tenant.updateOne({ _id: tenant._id }, { $set: { dailyReport: { email, phone } } });

    await createAuditLog(request, {
      tenantId: tenant._id.toString(),
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'tenant',
      entityId: tenant._id.toString(),
      changes: { dailyReport: { from: tenant.dailyReport ?? {}, to: { email, phone } } },
    });

    return NextResponse.json({ success: true, data: { email, phone } });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to save daily report recipients');
  }
}
