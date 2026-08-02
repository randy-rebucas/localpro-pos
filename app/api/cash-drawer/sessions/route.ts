import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';
import { Prisma } from '@prisma/client';

function serializeSession(s: {
  id: string;
  userId: string;
  openingAmount: Prisma.Decimal;
  closingAmount: Prisma.Decimal | null;
  expectedAmount: Prisma.Decimal | null;
  shortage: Prisma.Decimal | null;
  overage: Prisma.Decimal | null;
  totalVAT: Prisma.Decimal;
  totalDiscounts: Prisma.Decimal;
  user?: { name: string; email: string } | null;
  [key: string]: unknown;
}) {
  const { id, user, ...rest } = s;
  return {
    _id: id,
    ...rest,
    openingAmount: Number(s.openingAmount),
    closingAmount: s.closingAmount != null ? Number(s.closingAmount) : null,
    expectedAmount: s.expectedAmount != null ? Number(s.expectedAmount) : null,
    shortage: s.shortage != null ? Number(s.shortage) : null,
    overage: s.overage != null ? Number(s.overage) : null,
    totalVAT: Number(s.totalVAT),
    totalDiscounts: Number(s.totalDiscounts),
    userId: user ? { _id: s.userId, name: user.name, email: user.email } : s.userId,
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    if (!(await hasTenantPermission(user.role, tenantId, 'cash_drawer.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const skip = (page - 1) * limit;

    const where: Prisma.CashDrawerSessionWhereInput = { tenantId };
    if (status) {
      where.status = status as Prisma.CashDrawerSessionWhereInput['status'];
    }

    const [sessions, total] = await Promise.all([
      prisma.cashDrawerSession.findMany({
        where,
        include: { user: { select: { name: true, email: true } } },
        orderBy: { openingTime: 'desc' },
        skip,
        take: limit,
      }),
      prisma.cashDrawerSession.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: sessions.map(serializeSession),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error: unknown) {
    logger.error('Error fetching cash drawer sessions:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    const body = await request.json();
    const { action, openingAmount, closingAmount, notes } = body;

    if (action === 'open') {
      const amount = parseFloat(openingAmount);
      if (isNaN(amount) || amount < 0) {
        return NextResponse.json(
          { success: false, error: 'Opening amount must be a non-negative number' },
          { status: 400 }
        );
      }
      const roundedAmount = Math.round(amount * 100) / 100;

      const existing = await prisma.cashDrawerSession.findFirst({ where: { tenantId, status: 'open' } });
      if (existing) {
        return NextResponse.json(
          { success: false, error: t('validation.cashDrawerAlreadyOpen', 'There is already an open cash drawer session') },
          { status: 400 }
        );
      }

      let session;
      try {
        session = await prisma.cashDrawerSession.create({
          data: {
            tenantId,
            userId: user.userId,
            openingAmount: roundedAmount,
            openingTime: new Date(),
            status: 'open',
            notes: notes || undefined,
          },
        });
      } catch (err: unknown) {
        // Partial unique index enforces one open session per tenant — a race
        // between the check above and this insert surfaces as P2002.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          return NextResponse.json(
            { success: false, error: t('validation.cashDrawerAlreadyOpen', 'There is already an open cash drawer session') },
            { status: 400 }
          );
        }
        throw err;
      }

      await createAuditLog(request, {
        tenantId,
        userId: user.userId,
        action: AuditActions.CREATE,
        entityType: 'cashDrawerSession',
        entityId: session.id,
        changes: { action: 'open', openingAmount: roundedAmount },
      });

      return NextResponse.json({ success: true, data: serializeSession(session) }, { status: 201 });

    } else if (action === 'close') {
      const amount = parseFloat(closingAmount);
      if (isNaN(amount) || amount < 0) {
        return NextResponse.json(
          { success: false, error: 'Closing amount must be a non-negative number' },
          { status: 400 }
        );
      }
      const actualClosingAmount = Math.round(amount * 100) / 100;

      let openSession = await prisma.cashDrawerSession.findFirst({
        where: { tenantId, userId: user.userId, status: 'open' },
      });
      if (!openSession) {
        if (!(await hasTenantPermission(user.role, tenantId, 'cash_drawer.close'))) {
          return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
        }
        openSession = await prisma.cashDrawerSession.findFirst({ where: { tenantId, status: 'open' } });
      }

      if (!openSession) {
        return NextResponse.json(
          { success: false, error: t('validation.noOpenCashDrawerSession', 'No open cash drawer session found') },
          { status: 404 }
        );
      }

      const sessionEnd = new Date();
      const sessionUserId = openSession.userId;

      const [cashTransactions, cashExpenses] = await Promise.all([
        prisma.transaction.findMany({
          where: {
            tenantId,
            userId: sessionUserId,
            paymentMethod: 'cash',
            createdAt: { gte: openSession.openingTime, lte: sessionEnd },
            status: 'completed',
          },
        }),
        prisma.expense.findMany({
          where: {
            tenantId,
            paymentMethod: 'cash',
            date: { gte: openSession.openingTime, lte: sessionEnd },
          },
        }),
      ]);

      const cashSalesCents = cashTransactions.reduce((sum, t) => sum + Math.round(Number(t.total || 0) * 100), 0);
      const totalVATCents = cashTransactions.reduce((sum, t) => sum + Math.round(Number(t.taxAmount || 0) * 100), 0);
      const totalDiscountsCents = cashTransactions.reduce((sum, t) => sum + Math.round(Number(t.discountAmount || 0) * 100), 0);
      const cashExpensesCents = cashExpenses.reduce((sum, e) => sum + Math.round(Number(e.amount || 0) * 100), 0);

      const openingCents = Math.round(Number(openSession.openingAmount) * 100);
      const expectedCents = openingCents + cashSalesCents - cashExpensesCents;
      const closingCents = Math.round(actualClosingAmount * 100);
      const differenceCents = closingCents - expectedCents;

      const expectedAmount = expectedCents / 100;
      const shortage = differenceCents < 0 ? Math.abs(differenceCents) / 100 : 0;
      const overage = differenceCents > 0 ? differenceCents / 100 : 0;

      const updated = await prisma.cashDrawerSession.update({
        where: { id: openSession.id },
        data: {
          closingAmount: actualClosingAmount,
          expectedAmount,
          shortage,
          overage,
          closingTime: sessionEnd,
          status: 'closed',
          totalVAT: totalVATCents / 100,
          totalDiscounts: totalDiscountsCents / 100,
          ...(notes ? { notes } : {}),
        },
      });

      await createAuditLog(request, {
        tenantId,
        userId: user.userId,
        action: AuditActions.UPDATE,
        entityType: 'cashDrawerSession',
        entityId: updated.id,
        changes: {
          action: 'close',
          closingAmount: actualClosingAmount,
          expectedAmount,
          shortage,
          overage,
          transactionCount: cashTransactions.length,
        },
      });

      return NextResponse.json({ success: true, data: serializeSession(updated) });

    } else {
      return NextResponse.json(
        { success: false, error: t('validation.invalidCashDrawerAction', 'Invalid action. Use "open" or "close"') },
        { status: 400 }
      );
    }
  } catch (error: unknown) {
    logger.error('Error managing cash drawer session:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
