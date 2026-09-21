import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma, { dbTransaction } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';

async function resolveTenant(slug: string) {
  return prisma.tenant.findUnique({ where: { slug }, select: { id: true, slug: true, name: true } });
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

    const [events, total] = await Promise.all([
      prisma.billingEvent.findMany({
        where: { tenantId: tenant.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.billingEvent.count({ where: { tenantId: tenant.id } }),
    ]);

    const data = events.map((ev) => ({ ...ev, amount: Number(ev.amount) }));

    return NextResponse.json({
      success: true,
      data,
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
    const adminUser = await requireRole(request, ['super_admin']);

    const { tenantSlug } = await params;
    const tenant = await resolveTenant(tenantSlug);
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const subscription = await prisma.subscription.findFirst({ where: { tenantId: tenant.id } });
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

    // Idempotency: a transactionId identifies the same underlying payment, so
    // a retry/double-submit with the same (tenant, transactionId, type) is
    // treated as a no-op rather than double-recording revenue/refunds.
    if (transactionId) {
      const existingEvent = await prisma.billingEvent.findFirst({
        where: { tenantId: tenant.id, transactionId, type },
      });
      if (existingEvent) {
        return NextResponse.json({ success: true, data: existingEvent }, { status: 200 });
      }
    }

    const event = await dbTransaction(async (tx) => {
      const created = await tx.billingEvent.create({
        data: {
          id: randomUUID(),
          tenantId: tenant.id,
          subscriptionId: subscription.id,
          type,
          amount: Number(amount),
          currency: 'PHP',
          description,
          notes,
          transactionId,
          invoiceUrl,
          recordedById: adminUser.userId,
        },
      });

      const ip = request.headers.get('x-forwarded-for') || '';
      await tx.superAdminAction.create({
        data: {
          id: randomUUID(),
          adminUserId: adminUser.userId,
          action: 'billing.record',
          targetType: 'Subscription',
          targetId: subscription.id,
          description: `Recorded billing event "${type}" (${amount}) for tenant ${tenantSlug}`,
          ipAddress: ip,
          userAgent: request.headers.get('user-agent') || '',
        },
      });

      return created;
    });

    await createAuditLog(request, {
      tenantId: tenant.id,
      userId: adminUser.userId,
      action: AuditActions.CREATE,
      entityType: 'billing_event',
      entityId: event.id,
      changes: { type, amount, transactionId, invoiceUrl },
      metadata: { recordedBy: adminUser.userId, role: 'super_admin' },
    });

    return NextResponse.json({ success: true, data: event }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    return handleApiError(error);
  }
}
