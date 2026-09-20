import { randomUUID } from 'crypto';
import prisma from '@/lib/db';
import { logger } from '@/lib/logger';
import { SYSTEM_ACCOUNT_CODES } from '@/lib/accounting/system-accounts';

/**
 * Best-effort, idempotent auto-posting from POS events into the general
 * ledger. Each function:
 *  - looks up the tenant's system accounts by well-known code
 *  - checks for an existing JournalEntry with the same [tenantId, source, sourceId]
 *    before posting again (idempotency)
 *  - never throws — callers invoke these fire-and-forget after their primary
 *    write has already committed, so a ledger-posting failure must never
 *    fail the checkout/expense/cash-drawer request.
 */

async function getAccountMap(tenantId: string, codes: string[]): Promise<Map<string, string>> {
  const accounts = await prisma.ledgerAccount.findMany({
    where: { tenantId, code: { in: codes } },
    select: { id: true, code: true },
  });
  return new Map(accounts.map((a) => [a.code, a.id]));
}

async function alreadyPosted(tenantId: string, source: string, sourceId: string): Promise<boolean> {
  const existing = await prisma.journalEntry.findFirst({
    where: { tenantId, source, sourceId, isActive: { not: false } },
    select: { id: true },
  });
  return Boolean(existing);
}

/**
 * Posts a completed sale to the ledger:
 *  Debit Cash (or Accounts Receivable for on-account/credit sales) = total
 *  Credit Sales Revenue = subtotal
 *  Credit VAT Payable = taxAmount (if any)
 *  Debit Discounts Given = discountAmount (if any, contra-revenue)
 */
export async function postTransactionToLedger(transactionId: string): Promise<void> {
  try {
    const transaction = await prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!transaction) return;
    if (transaction.status !== 'completed') return;

    const tenantId = transaction.tenantId;
    if (await alreadyPosted(tenantId, 'transaction', transactionId)) return;

    const accounts = await getAccountMap(tenantId, [
      SYSTEM_ACCOUNT_CODES.CASH,
      SYSTEM_ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
      SYSTEM_ACCOUNT_CODES.SALES_REVENUE,
      SYSTEM_ACCOUNT_CODES.VAT_PAYABLE,
      SYSTEM_ACCOUNT_CODES.DISCOUNTS_GIVEN,
    ]);

    const cashOrArId =
      transaction.paymentMethod === 'on_account'
        ? accounts.get(SYSTEM_ACCOUNT_CODES.ACCOUNTS_RECEIVABLE)
        : accounts.get(SYSTEM_ACCOUNT_CODES.CASH);
    const salesRevenueId = accounts.get(SYSTEM_ACCOUNT_CODES.SALES_REVENUE);
    const vatPayableId = accounts.get(SYSTEM_ACCOUNT_CODES.VAT_PAYABLE);
    const discountsGivenId = accounts.get(SYSTEM_ACCOUNT_CODES.DISCOUNTS_GIVEN);

    if (!cashOrArId || !salesRevenueId) {
      logger.error('postTransactionToLedger: missing system accounts, skipping', { tenantId, transactionId });
      return;
    }

    const subtotal = Number(transaction.subtotal) || 0;
    const taxAmount = Number(transaction.taxAmount) || 0;
    const discountAmount = Number(transaction.discountAmount) || 0;
    const total = Number(transaction.total) || 0;

    if (total <= 0) return;

    const lines: Array<{ accountId: string; debit: number; credit: number; description?: string }> = [
      { accountId: cashOrArId, debit: total, credit: 0, description: 'Sale proceeds' },
      { accountId: salesRevenueId, debit: 0, credit: subtotal, description: 'Sales revenue' },
    ];
    if (taxAmount > 0 && vatPayableId) {
      lines.push({ accountId: vatPayableId, debit: 0, credit: taxAmount, description: 'VAT on sale' });
    }
    if (discountAmount > 0 && discountsGivenId) {
      lines.push({ accountId: discountsGivenId, debit: discountAmount, credit: 0, description: 'Discount given' });
    }

    await prisma.journalEntry.create({
      data: {
        id: randomUUID(),
        tenantId,
        branchId: transaction.branchId || undefined,
        entryDate: transaction.createdAt,
        memo: `Sale ${transaction.receiptNumber || transaction.id}`,
        source: 'transaction',
        sourceId: transactionId,
        lines: {
          create: lines.map((l) => ({ id: randomUUID(), ...l })),
        },
      },
    });
  } catch (error) {
    logger.error('postTransactionToLedger failed (non-fatal)', { transactionId, error });
  }
}

/**
 * Posts an expense to the ledger:
 *  Debit the expense's mapped account (or General Expenses if unmapped) = amount
 *  Credit Cash (or Accounts Payable for non-cash/unpaid methods) = amount
 */
export async function postExpenseToLedger(expenseId: string): Promise<void> {
  try {
    const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
    if (!expense) return;

    const tenantId = expense.tenantId;
    if (await alreadyPosted(tenantId, 'expense', expenseId)) return;

    const accounts = await getAccountMap(tenantId, [
      SYSTEM_ACCOUNT_CODES.CASH,
      SYSTEM_ACCOUNT_CODES.ACCOUNTS_PAYABLE,
      SYSTEM_ACCOUNT_CODES.GENERAL_EXPENSES,
    ]);

    let debitAccountId = expense.ledgerAccountId || undefined;
    if (debitAccountId) {
      const mapped = await prisma.ledgerAccount.findFirst({
        where: { id: debitAccountId, tenantId, isActive: { not: false } },
        select: { id: true },
      });
      if (!mapped) debitAccountId = undefined;
    }
    if (!debitAccountId) debitAccountId = accounts.get(SYSTEM_ACCOUNT_CODES.GENERAL_EXPENSES);

    const creditAccountId =
      expense.paymentMethod === 'cash'
        ? accounts.get(SYSTEM_ACCOUNT_CODES.CASH)
        : accounts.get(SYSTEM_ACCOUNT_CODES.ACCOUNTS_PAYABLE);

    if (!debitAccountId || !creditAccountId) {
      logger.error('postExpenseToLedger: missing system accounts, skipping', { tenantId, expenseId });
      return;
    }

    const amount = Number(expense.amount) || 0;
    if (amount <= 0) return;

    await prisma.journalEntry.create({
      data: {
        id: randomUUID(),
        tenantId,
        entryDate: expense.date,
        memo: `Expense: ${expense.name}`,
        source: 'expense',
        sourceId: expenseId,
        lines: {
          create: [
            { id: randomUUID(), accountId: debitAccountId, debit: amount, credit: 0, description: expense.name },
            { id: randomUUID(), accountId: creditAccountId, debit: 0, credit: amount, description: expense.name },
          ],
        },
      },
    });
  } catch (error) {
    logger.error('postExpenseToLedger failed (non-fatal)', { expenseId, error });
  }
}

/**
 * Posts a cash-drawer close variance (shortage/overage) as a small adjusting
 * entry against the "Cash Over/Short" account. No-op if the session closed
 * with zero variance.
 */
export async function postCashDrawerVarianceToLedger(cashDrawerSessionId: string): Promise<void> {
  try {
    const session = await prisma.cashDrawerSession.findUnique({ where: { id: cashDrawerSessionId } });
    if (!session) return;
    if (session.status !== 'closed') return;

    const shortage = Number(session.shortage) || 0;
    const overage = Number(session.overage) || 0;
    if (shortage <= 0 && overage <= 0) return;

    const tenantId = session.tenantId;
    if (await alreadyPosted(tenantId, 'cash_drawer', cashDrawerSessionId)) return;

    const accounts = await getAccountMap(tenantId, [
      SYSTEM_ACCOUNT_CODES.CASH,
      SYSTEM_ACCOUNT_CODES.CASH_OVER_SHORT,
    ]);
    const cashId = accounts.get(SYSTEM_ACCOUNT_CODES.CASH);
    const overShortId = accounts.get(SYSTEM_ACCOUNT_CODES.CASH_OVER_SHORT);
    if (!cashId || !overShortId) {
      logger.error('postCashDrawerVarianceToLedger: missing system accounts, skipping', { tenantId, cashDrawerSessionId });
      return;
    }

    // Shortage: actual cash is less than expected -> credit Cash, debit expense (loss).
    // Overage: actual cash is more than expected -> debit Cash, credit expense (contra, reduces expense).
    const amount = shortage > 0 ? shortage : overage;
    const lines = shortage > 0
      ? [
          { accountId: overShortId, debit: amount, credit: 0, description: 'Cash shortage' },
          { accountId: cashId, debit: 0, credit: amount, description: 'Cash shortage' },
        ]
      : [
          { accountId: cashId, debit: amount, credit: 0, description: 'Cash overage' },
          { accountId: overShortId, debit: 0, credit: amount, description: 'Cash overage' },
        ];

    await prisma.journalEntry.create({
      data: {
        id: randomUUID(),
        tenantId,
        entryDate: session.closingTime || new Date(),
        memo: shortage > 0 ? 'Cash drawer shortage' : 'Cash drawer overage',
        source: 'cash_drawer',
        sourceId: cashDrawerSessionId,
        lines: { create: lines.map((l) => ({ id: randomUUID(), ...l })) },
      },
    });
  } catch (error) {
    logger.error('postCashDrawerVarianceToLedger failed (non-fatal)', { cashDrawerSessionId, error });
  }
}
