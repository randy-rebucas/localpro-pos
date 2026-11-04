import { NextRequest, NextResponse } from 'next/server';
import { getRepos, type PaymentFilter, type PaymentRecordMethod, type PaymentStatus } from '@/lib/db';
import { requireTenantAccess } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  try {
    const tenantAccess = await requireTenantAccess(request);
    const { tenantId } = tenantAccess;
    
    const searchParams = request.nextUrl.searchParams;
    const rawLimit = parseInt(searchParams.get('limit') || '50');
    const limit = Math.min(Math.max(1, rawLimit), 200);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const skip = (page - 1) * limit;
    const status = searchParams.get('status');
    const method = searchParams.get('method');
    const transactionId = searchParams.get('transactionId');

    const filter: PaymentFilter = { notDisabled: true };

    if (status) {
      filter.status = status as PaymentStatus;
    }

    if (method) {
      filter.method = method as PaymentRecordMethod;
    }

    if (transactionId) {
      filter.transactionId = transactionId;
    }

    const { payments: paymentRepo } = getRepos();
    const payments = await paymentRepo.listWithRefs(tenantId, filter, { page: { skip, limit } });
    const total = await paymentRepo.count(tenantId, filter);

    return NextResponse.json({
      success: true,
      data: payments,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to fetch payments';
    if (msg.includes('Unauthorized') || msg.includes('Forbidden')) {
      return NextResponse.json({ success: false, error: msg }, { status: msg.includes('Unauthorized') ? 401 : 403 });
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantAccess = await requireTenantAccess(request);
    const { tenantId, user } = tenantAccess;

    const rl = checkRateLimit(`payments:${user.userId}`, 60, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }
    
    const body = await request.json();
    const { transactionId, method, amount, details } = body;

    // Validate required fields
    if (!transactionId || !method || !amount) {
      return NextResponse.json(
        { success: false, error: 'Transaction ID, payment method, and amount are required' },
        { status: 400 }
      );
    }

    // Validate payment method
    const validMethods = ['cash', 'card', 'digital', 'check', 'other'];
    if (!validMethods.includes(method)) {
      return NextResponse.json(
        { success: false, error: 'Invalid payment method' },
        { status: 400 }
      );
    }

    // Verify transaction exists and belongs to tenant
    const { transactions, payments } = getRepos();
    const transaction = await transactions.findById(tenantId, transactionId, { select: '_id' });

    if (!transaction) {
      return NextResponse.json(
        { success: false, error: 'Transaction not found' },
        { status: 404 }
      );
    }

    // Create payment record
    const payment = await payments.create(tenantId, {
      transactionId,
      method,
      amount,
      details,
      status: 'completed',
      processedBy: user.userId,
      processedAt: new Date(),
    });

    // Create audit log
    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.PAYMENT_CREATE,
      entityType: 'payment',
      entityId: payment._id,
      changes: {
        transactionId: transactionId.toString(),
        method,
        amount,
      },
    });

    return NextResponse.json({ success: true, data: payment }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to create payment';
    if (msg.includes('Unauthorized') || msg.includes('Forbidden')) {
      return NextResponse.json({ success: false, error: msg }, { status: msg.includes('Unauthorized') ? 401 : 403 });
    }
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
