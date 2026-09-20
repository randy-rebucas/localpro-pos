/**
 * Double-entry ledger helpers: balance validation and account-balance
 * computation. Pattern-matched to lib/delivery-helpers.ts / lib/work-order-helpers.ts
 * (plain functions, no side effects beyond what's passed in).
 */

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface JournalLineInput {
  accountId: string;
  debit: number;
  credit: number;
  description?: string;
}

/**
 * Validates that a set of journal lines is a legal double-entry posting:
 * - at least 2 lines
 * - each line has exactly one of debit/credit non-zero (and non-negative)
 * - sum(debit) === sum(credit) (compared in integer cents to avoid float drift)
 * Throws an Error with a human-readable message when invalid.
 */
export function validateJournalEntryBalance(lines: JournalLineInput[]): void {
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new Error('A journal entry requires at least 2 lines');
  }

  let totalDebitCents = 0;
  let totalCreditCents = 0;

  for (const line of lines) {
    const debit = Number(line.debit) || 0;
    const credit = Number(line.credit) || 0;

    if (debit < 0 || credit < 0) {
      throw new Error('Debit and credit amounts must not be negative');
    }
    if (debit > 0 && credit > 0) {
      throw new Error('A journal line cannot have both a debit and a credit amount');
    }
    if (debit === 0 && credit === 0) {
      throw new Error('A journal line must have either a debit or a credit amount');
    }
    if (!line.accountId) {
      throw new Error('Every journal line must reference an account');
    }

    totalDebitCents += Math.round(debit * 100);
    totalCreditCents += Math.round(credit * 100);
  }

  if (totalDebitCents !== totalCreditCents) {
    throw new Error(
      `Journal entry is not balanced: total debits (${(totalDebitCents / 100).toFixed(2)}) must equal total credits (${(totalCreditCents / 100).toFixed(2)})`
    );
  }
}

/**
 * Normal-balance-aware account balance: for asset/expense accounts, a debit
 * increases the balance (debit − credit); for liability/equity/revenue
 * accounts, a credit increases the balance (credit − debit).
 */
export function computeAccountBalance(
  type: AccountType,
  totalDebit: number,
  totalCredit: number
): number {
  const debit = Number(totalDebit) || 0;
  const credit = Number(totalCredit) || 0;

  if (type === 'asset' || type === 'expense') {
    return debit - credit;
  }
  return credit - debit;
}

export function formatAccountBalance(balance: number, currencySymbol = ''): string {
  const abs = Math.abs(balance).toFixed(2);
  const sign = balance < 0 ? '-' : '';
  return currencySymbol ? `${sign}${currencySymbol}${abs}` : `${sign}${abs}`;
}
