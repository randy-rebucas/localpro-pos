import { NextRequest, NextResponse } from 'next/server';
import { getRepos, type BillingEventType } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';

function resolveTenant(slug: string) {
  return getRepos().tenants.findBySlug(slug, { select: '_id slug name' });
}

// GET /api/super-admin/billing/[tenantSlug] — billing event history
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> }
) {
  try {
    await requireRole(request, ['super_admin']);

    const { tenantSlug } = await params;
    const tenant = await resolveTenant(tenantSlug);
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));

    const { items: events, total } = await getRepos().billingEvents.list(tenant._id, {
      skip: (page - 1) * limit,
      limit,
    });

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
    // SuperAdminAction is not behind the repository layer yet
    const adminUser = await requireRole(request, ['super_admin']);

    const { tenantSlug } = await params;
    const tenant = await resolveTenant(tenantSlug);
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const subscription = await getRepos().subscriptions.findByTenant(tenant._id);
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

    const event = await getRepos().billingEvents.create(tenant._id, {
      subscriptionId: subscription._id,
      type: type as BillingEventType,
      amount: Number(amount),
      currency: 'PHP',
      description,
      notes,
      transactionId,
      invoiceUrl,
      recordedBy: adminUser.userId,
    });

    await createAuditLog(request, {
      tenantId: tenant._id,
      userId: adminUser.userId,
      action: AuditActions.CREATE,
      entityType: 'billing_event',
      entityId: event._id,
      changes: { type, amount, transactionId, invoiceUrl },
      metadata: { recordedBy: adminUser.userId, role: 'super_admin' },
    });

    const ip = request.headers.get('x-forwarded-for') || '';
    await getRepos().superAdminActions.create({
      adminUserId: adminUser.userId,
      action: 'billing.record',
      targetType: 'Subscription',
      targetId: subscription._id,

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
