import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { getProfitLossSummary } from '@/lib/analytics';
import { SYSTEM_ACCOUNT_CODES } from '@/lib/accounting/system-accounts';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

/**
 * GET - Reconciliation summary: calls the existing getProfitLossSummary
 * (Transaction+Expense aggregation) and cross-checks it against ledger-
 * derived revenue/expense totals for the same period. Not a replacement for
 * the existing P&L report — a sanity check that auto-posting agrees with it.
 * Query params: startDate, endDate (both required; ISO date strings).
 */
export async function GET(request: NextRequest) {
  try {
    let user;
    const t = await getValidationTranslatorFromRequest(request);
    try {
      user = await requireAuth(request);
    } catch {
      return NextResponse.json(
        { success: false, error: t('validation.unauthorized', 'Unauthorized') },
        { status: 401 }
      );
    }

    const tenantId = await getTenantIdFromRequest(request);
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
    }

    if (
      !(await hasTenantPermission(user.role, tenantId, 'ledger.view')) &&
      !(await hasTenantPermission(user.role, tenantId, 'ledger.manage'))
    ) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');

    const endDate = endDateParam ? new Date(endDateParam) : new Date();
    const startDate = startDateParam
      ? new Date(startDateParam)
      : new Date(endDate.getFullYear(), endDate.getMonth(), 1);

    const plSummary = await getProfitLossSummary(tenantId.toString(), startDate, endDate);

    const revenueAccount = await prisma.ledgerAccount.findFirst({
      where: { tenantId, code: SYSTEM_ACCOUNT_CODES.SALES_REVENUE },
      select: { id: true },
    });
    const expenseAccounts = await prisma.ledgerAccount.findMany({
      where: { tenantId, type: 'expense', isActive: { not: false } },
      select: { id: true },
    });

    const [revenueLines, expenseLines] = await Promise.all([
      revenueAccount
        ? prisma.journalLine.findMany({
            where: {
              accountId: revenueAccount.id,
              journalEntry: { tenantId, isActive: { not: false }, entryDate: { gte: startDate, lte: endDate } },
            },
            select: { debit: true, credit: true },
          })
        : Promise.resolve([]),
      expenseAccounts.length
        ? prisma.journalLine.findMany({
            where: {
              accountId: { in: expenseAccounts.map((a) => a.id) },
              journalEntry: { tenantId, isActive: { not: false }, entryDate: { gte: startDate, lte: endDate } },
            },
            select: { debit: true, credit: true },
          })
        : Promise.resolve([]),
    ]);

    const ledgerRevenue = revenueLines.reduce((sum, l) => sum + (Number(l.credit) - Number(l.debit)), 0);
    const ledgerExpense = expenseLines.reduce((sum, l) => sum + (Number(l.debit) - Number(l.credit)), 0);

    return NextResponse.json({
      success: true,
      data: {
        period: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
        profitLoss: plSummary,
        ledger: {
          revenue: ledgerRevenue,
          expense: ledgerExpense,
        },
        reconciliation: {
          revenueDifference: Number((plSummary.revenue.total - ledgerRevenue).toFixed(2)),
          expenseDifference: Number((plSummary.expenses.total - ledgerExpense).toFixed(2)),
        },
      },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Ledger summary report error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToGenerateLedgerSummary', 'Failed to generate ledger summary') },
      { status: 500 }
    );
  }
}
