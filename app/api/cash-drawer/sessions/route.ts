import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    if (!(await hasTenantPermission(user.role, tenantId, 'cash_drawer.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { tenantId };
    if (status) {
      where.status = status;
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
      data: sessions,
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
      // Validate opening amount
      const amount = parseFloat(openingAmount);
      if (isNaN(amount) || amount < 0) {
        return NextResponse.json(
          { success: false, error: t('validation.invalidOpeningAmount', 'Opening amount must be a non-negative number') },
          { status: 400 }
        );
      }
      const roundedAmount = Math.round(amount * 100) / 100;

      // Check-and-create: prevent race condition where two requests both pass
      // the "no open session" check simultaneously. Full atomicity against a
      // concurrent open() relies on the Postgres partial unique index on
      // {tenantId, status='open'} created at the migration-SQL level; this
      // findFirst is the same best-effort guard the previous Mongoose code used.
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
            id: randomUUID(),
            tenantId,
            userId: user.userId,
            openingAmount: roundedAmount,
            openingTime: new Date(),
            status: 'open',
            notes: notes || undefined,
          },
        });
      } catch (err: unknown) {
        // Duplicate key error (unique constraint) means another request created
        // a session between check and create (guarded by the partial unique index).
        if (
          err &&
          typeof err === 'object' &&
          'code' in err &&
          (err as { code?: string }).code === 'P2002'
        ) {
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

      return NextResponse.json({ success: true, data: session }, { status: 201 });

    } else if (action === 'close') {
      // Validate closing amount
      const amount = parseFloat(closingAmount);
      if (isNaN(amount) || amount < 0) {
        return NextResponse.json(
          { success: false, error: t('validation.invalidClosingAmount', 'Closing amount must be a non-negative number') },
          { status: 400 }
        );
      }
      const actualClosingAmount = Math.round(amount * 100) / 100;

      // Find open session — prefer current user's session
      let openSession = await prisma.cashDrawerSession.findFirst({
        where: { tenantId, userId: user.userId, status: 'open' },
      });
      // Fallback: any open session (for managers closing another cashier's drawer)
      if (!openSession) {
        if (!(await hasTenantPermission(user.role, tenantId, 'cash_drawer.close'))) {
          return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
        }
        openSession = await prisma.cashDrawerSession.findFirst({ where: { tenantId, status: 'open' } });
      }

      if (!openSession) {
        return NextResponse.json(
          { success: false, error: t('validation.noOpenCashDrawerSession', 'No open cash drawer session found') },
          { status: 404 }
        );
      }

      // Calculate expected amount — filter by the session's userId to avoid mixing cashiers
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

      // Use integer math (cents) to avoid floating point errors
      const cashSalesCents = cashTransactions.reduce((sum, tx) => sum + Math.round(Number(tx.total || 0) * 100), 0);
      const totalVATCents = cashTransactions.reduce((sum, tx) => sum + Math.round(Number(tx.taxAmount || 0) * 100), 0);
      const totalDiscountsCents = cashTransactions.reduce((sum, tx) => sum + Math.round(Number(tx.discountAmount || 0) * 100), 0);
      const cashExpensesCents = cashExpenses.reduce((sum, e) => sum + Math.round(Number(e.amount || 0) * 100), 0);

      const openingCents = Math.round(Number(openSession.openingAmount) * 100);
      const expectedCents = openingCents + cashSalesCents - cashExpensesCents;
      const closingCents = Math.round(actualClosingAmount * 100);
      const differenceCents = closingCents - expectedCents;

      const expectedAmount = expectedCents / 100;
      const shortage = differenceCents < 0 ? Math.abs(differenceCents) / 100 : 0;
      const overage = differenceCents > 0 ? differenceCents / 100 : 0;

      // Atomic claim: guards against a double-click/retry closing the same
      // session twice before either write lands (findFirst above is not atomic).
      const claimResult = await prisma.cashDrawerSession.updateMany({
        where: { id: openSession.id, tenantId, status: 'open' },
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

      if (claimResult.count === 0) {
        return NextResponse.json(
          { success: false, error: t('validation.noOpenCashDrawerSession', 'No open cash drawer session found') },
          { status: 409 }
        );
      }
      const closedSession = await prisma.cashDrawerSession.findFirst({ where: { id: openSession.id, tenantId } });
      openSession = closedSession ?? openSession;

      await createAuditLog(request, {
        tenantId,
        userId: user.userId,
        action: AuditActions.UPDATE,
        entityType: 'cashDrawerSession',
        entityId: openSession.id,
        changes: {
          action: 'close',
          closingAmount: actualClosingAmount,
          expectedAmount,
          shortage,
          overage,
          transactionCount: cashTransactions.length,
        },
      });

      return NextResponse.json({ success: true, data: openSession });

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
