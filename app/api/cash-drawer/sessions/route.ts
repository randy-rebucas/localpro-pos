import { NextRequest, NextResponse } from 'next/server';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getRepos, isDuplicateKeyError, type CashDrawerSession } from '@/lib/db';
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

    const query = status ? { status: status as CashDrawerSession['status'] } : {};

    const { cashDrawerSessions } = getRepos();
    const [sessions, total] = await Promise.all([
      cashDrawerSessions.list(tenantId, query, { populateUser: true, page: { skip, limit } }),
      cashDrawerSessions.count(tenantId, query),
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

      // Atomic check-and-create: prevent race condition where two requests
      // both pass the "no open session" check simultaneously.
      // findOneAndUpdate with upsert + unique index on {tenantId, status: 'open'} ensures only one.
      const { cashDrawerSessions } = getRepos();
      const existing = await cashDrawerSessions.findOpen(tenantId);
      if (existing) {
        return NextResponse.json(
          { success: false, error: t('validation.cashDrawerAlreadyOpen', 'There is already an open cash drawer session') },
          { status: 400 }
        );
      }

      let session;
      try {
        session = await cashDrawerSessions.open(tenantId, {
          userId: user.userId,
          openingAmount: roundedAmount,
          openingTime: new Date(),
          notes: notes || undefined,
        });
      } catch (err: unknown) {
        // A duplicate key means another request created a session between check and create
        if (isDuplicateKeyError(err)) {
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
        entityId: session._id,
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
      const { cashDrawerSessions } = getRepos();
      let openSession = await cashDrawerSessions.findOpen(tenantId, { userId: user.userId });
      // Fallback: any open session (for managers closing another cashier's drawer)
      if (!openSession) {
        if (!(await hasTenantPermission(user.role, tenantId, 'cash_drawer.close'))) {
          return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
        }
        openSession = await cashDrawerSessions.findOpen(tenantId);
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
        getRepos().transactions.list(
          tenantId,
          {
            userId: sessionUserId,
            paymentMethod: 'cash',
            createdAt: { gte: openSession.openingTime, lte: sessionEnd },
            status: 'completed',
          },
          { select: 'total taxAmount discountAmount' }
        ),
        getRepos().expenses.listCashBetween(tenantId, openSession.openingTime, sessionEnd),
      ]);

      // Use integer math (cents) to avoid floating point errors
      const cashSalesCents = cashTransactions.reduce((sum, t) => sum + Math.round((t.total || 0) * 100), 0);
      const totalVATCents = cashTransactions.reduce((sum, t) => sum + Math.round((t.taxAmount || 0) * 100), 0);
      const totalDiscountsCents = cashTransactions.reduce((sum, t) => sum + Math.round((t.discountAmount || 0) * 100), 0);
      const cashExpensesCents = cashExpenses.reduce((sum, e) => sum + Math.round((e.amount || 0) * 100), 0);

      const openingCents = Math.round(openSession.openingAmount * 100);
      const expectedCents = openingCents + cashSalesCents - cashExpensesCents;
      const closingCents = Math.round(actualClosingAmount * 100);
      const differenceCents = closingCents - expectedCents;

      const expectedAmount = expectedCents / 100;
      const shortage = differenceCents < 0 ? Math.abs(differenceCents) / 100 : 0;
      const overage = differenceCents > 0 ? differenceCents / 100 : 0;

      // Atomic claim: guards against a double-click/retry closing the same
      // session twice before either write lands (findOne above is not atomic).
      const closedSession = await cashDrawerSessions.close(tenantId, openSession._id, {
        closingAmount: actualClosingAmount,
        expectedAmount,
        shortage,
        overage,
        closingTime: sessionEnd,
        totalVAT: totalVATCents / 100,
        totalDiscounts: totalDiscountsCents / 100,
        ...(notes ? { notes } : {}),
      });

      if (!closedSession) {
        return NextResponse.json(
          { success: false, error: t('validation.noOpenCashDrawerSession', 'No open cash drawer session found') },
          { status: 409 }
        );
      }
      openSession = closedSession;

      await createAuditLog(request, {
        tenantId,
        userId: user.userId,
        action: AuditActions.UPDATE,
        entityType: 'cashDrawerSession',
        entityId: openSession._id,
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
