/**
 * System Chart of Accounts constants.
 *
 * These are the well-known account codes seeded for every tenant when
 * accounting is enabled. Auto-posting logic (lib/accounting/auto-post.ts)
 * looks accounts up by these codes, so they must stay stable.
 */

export type SystemAccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface SystemAccountDefinition {
  code: string;
  name: string;
  type: SystemAccountType;
}

export const SYSTEM_ACCOUNT_CODES = {
  CASH: '1000',
  ACCOUNTS_RECEIVABLE: '1010',
  ACCOUNTS_PAYABLE: '2000',
  VAT_PAYABLE: '2010',
  OWNERS_EQUITY: '3000',
  SALES_REVENUE: '4000',
  DISCOUNTS_GIVEN: '4010',
  GENERAL_EXPENSES: '5000',
  COST_OF_GOODS_SOLD: '5010',
  CASH_OVER_SHORT: '5020',
} as const;

export const SYSTEM_ACCOUNTS: SystemAccountDefinition[] = [
  { code: SYSTEM_ACCOUNT_CODES.CASH, name: 'Cash', type: 'asset' },
  { code: SYSTEM_ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, name: 'Accounts Receivable', type: 'asset' },
  { code: SYSTEM_ACCOUNT_CODES.ACCOUNTS_PAYABLE, name: 'Accounts Payable', type: 'liability' },
  { code: SYSTEM_ACCOUNT_CODES.VAT_PAYABLE, name: 'VAT Payable', type: 'liability' },
  { code: SYSTEM_ACCOUNT_CODES.OWNERS_EQUITY, name: "Owner's Equity", type: 'equity' },
  { code: SYSTEM_ACCOUNT_CODES.SALES_REVENUE, name: 'Sales Revenue', type: 'revenue' },
  { code: SYSTEM_ACCOUNT_CODES.DISCOUNTS_GIVEN, name: 'Discounts Given', type: 'revenue' },
  { code: SYSTEM_ACCOUNT_CODES.GENERAL_EXPENSES, name: 'General Expenses', type: 'expense' },
  { code: SYSTEM_ACCOUNT_CODES.COST_OF_GOODS_SOLD, name: 'Cost of Goods Sold', type: 'expense' },
  { code: SYSTEM_ACCOUNT_CODES.CASH_OVER_SHORT, name: 'Cash Over/Short', type: 'expense' },
];
