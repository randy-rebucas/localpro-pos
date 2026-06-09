import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import Subscription from '@/models/Subscription';
import BillingEvent from '@/models/BillingEvent';
import SuperAdminAction from '@/models/SuperAdminAction';
import { requireRole } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';

async function resolveTenant(slug: string) {
  return Tenant.findOne({ slug }).select('_id slug name').lean() as Promise<{ _id: unknown; slug: string; name: string } | null>;
}

// GET /api/super-admin/billing/[tenantSlug] — billing event history
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> }
) {
  try {
    await connectDB();
    await requireRole(request, ['super_admin']);

    const { tenantSlug } = await params;
    const tenant = await resolveTenant(tenantSlug);
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));

    const [events, total] = await Promise.all([
      BillingEvent.find({ tenantId: tenant._id })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      BillingEvent.countDocuments({ tenantId: tenant._id }),
    ]);

    return NextResponse.json({
      success: true,
      data: events,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    return handleApiError(error);
  }
}

// POST /api/super-admin/billing/[tenantSlug] — manually record a billing event
// Body: { type, amount, description?, notes?, transactionId?, invoiceUrl? }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> }
) {
  try {
    await connectDB();
    const adminUser = await requireRole(request, ['super_admin']);

    const { tenantSlug } = await params;
    const tenant = await resolveTenant(tenantSlug);
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const subscription = await Subscription.findOne({ tenantId: tenant._id }).lean();
    if (!subscription) {
      return NextResponse.json({ success: false, error: 'No subscription found for this tenant' }, { status: 404 });
    }

    const body = await request.json();
    const { type, amount, description, notes, transactionId, invoiceUrl } = body;

    const validTypes = [
      'payment_received', 'payment_failed', 'refund_issued',
      'credit_applied', 'manual_adjustment', 'invoice_created',
    ];
    if (!type || !validTypes.includes(type)) {
      return NextResponse.json({ success: false, error: `type must be one of: ${validTypes.join(', ')}` }, { status: 400 });
    }
    if (amount === undefined || amount === null) {
      return NextResponse.json({ success: false, error: 'amount is required' }, { status: 400 });
    }

    const event = await BillingEvent.create({
      tenantId: tenant._id,
      subscriptionId: (subscription as { _id: unknown })._id,
      type,
      amount: Number(amount),
      currency: 'PHP',
      description,
      notes,
      transactionId,
      invoiceUrl,
      recordedBy: adminUser.userId,
    });

    const ip = request.headers.get('x-forwarded-for') || '';
    await SuperAdminAction.create({
      adminUserId: adminUser.userId,
      action: 'billing.record',
      targetType: 'Subscription',
      targetId: String((subscription as { _id: unknown })._id),
      description: `Recorded billing event "${type}" (${amount}) for tenant ${tenantSlug}`,
      ipAddress: ip,
      userAgent: request.headers.get('user-agent') || '',
    });

    return NextResponse.json({ success: true, data: event }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    return handleApiError(error);
  }
}
