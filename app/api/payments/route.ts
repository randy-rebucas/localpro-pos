import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireTenantAccess } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';
import { serializePayment } from '@/lib/data/payments';
import { Prisma } from '@prisma/client';

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

    const where: Prisma.PaymentWhereInput = { tenantId, isActive: true };

    if (status) {
      where.status = status as Prisma.PaymentWhereInput['status'];
    }

    if (method) {
      where.method = method as Prisma.PaymentWhereInput['method'];
    }

    if (transactionId) {
      where.transactionId = transactionId;
    }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
        include: {
          transaction: { select: { id: true, receiptNumber: true, total: true } },
          processedByUser: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.payment.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: payments.map(serializePayment),
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

    if (!transactionId || !method || !amount) {
      return NextResponse.json(
        { success: false, error: 'Transaction ID, payment method, and amount are required' },
        { status: 400 }
      );
    }

    const validMethods = ['cash', 'card', 'digital', 'check', 'other'];
    if (!validMethods.includes(method)) {
      return NextResponse.json(
        { success: false, error: 'Invalid payment method' },
        { status: 400 }
      );
    }

    const transaction = await prisma.transaction.findFirst({
      where: { id: transactionId, tenantId },
    });

    if (!transaction) {
      return NextResponse.json(
        { success: false, error: 'Transaction not found' },
        { status: 404 }
      );
    }

    const payment = await prisma.payment.create({
      data: {
        tenantId,
        transactionId,
        method,
        amount,
        details: details ?? undefined,
        status: 'completed',
        processedBy: user.userId,
        processedAt: new Date(),
      },
    });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.PAYMENT_CREATE,
      entityType: 'payment',
      entityId: payment.id,
      changes: {
        transactionId: String(transactionId),
        method,
        amount,
      },
    });

    return NextResponse.json({ success: true, data: serializePayment(payment) }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to create payment';
    if (msg.includes('Unauthorized') || msg.includes('Forbidden')) {
      return NextResponse.json({ success: false, error: msg }, { status: msg.includes('Unauthorized') ? 401 : 403 });
    }
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
