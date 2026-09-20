import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { computeAccountBalance, type AccountType } from '@/lib/ledger-helpers';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

/**
 * GET - Trial balance report: sums all JournalLines grouped by account, as
 * of an optional date, and returns each account's normal-balance-aware
 * balance alongside raw debit/credit totals so total debits == total credits
 * can be visually cross-checked.
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
    const asOfParam = searchParams.get('asOf');
    const asOf = asOfParam ? new Date(asOfParam) : undefined;

    const accounts = await prisma.ledgerAccount.findMany({
      where: { tenantId, isActive: { not: false } },
      orderBy: { code: 'asc' },
    });

    const lines = await prisma.journalLine.findMany({
      where: {
        account: { tenantId },
        journalEntry: {
          tenantId,
          isActive: { not: false },
          ...(asOf ? { entryDate: { lte: asOf } } : {}),
        },
      },
      select: { accountId: true, debit: true, credit: true },
    });

    const totalsByAccount = new Map<string, { debit: number; credit: number }>();
    for (const line of lines) {
      const cur = totalsByAccount.get(line.accountId) || { debit: 0, credit: 0 };
      cur.debit += Number(line.debit) || 0;
      cur.credit += Number(line.credit) || 0;
      totalsByAccount.set(line.accountId, cur);
    }

    const rows = accounts.map((account) => {
      const totals = totalsByAccount.get(account.id) || { debit: 0, credit: 0 };
      const balance = computeAccountBalance(account.type as AccountType, totals.debit, totals.credit);
      return {
        accountId: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        totalDebit: totals.debit,
        totalCredit: totals.credit,
        balance,
      };
    });

    const totalDebit = rows.reduce((sum, r) => sum + r.totalDebit, 0);
    const totalCredit = rows.reduce((sum, r) => sum + r.totalCredit, 0);

    return NextResponse.json({
      success: true,
      data: {
        asOf: asOf ? asOf.toISOString() : null,
        rows,
        totalDebit,
        totalCredit,
        isBalanced: Math.round(totalDebit * 100) === Math.round(totalCredit * 100),
      },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Trial balance report error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToGenerateTrialBalance', 'Failed to generate trial balance') },
      { status: 500 }
    );
  }
}
