process.env.JWT_SECRET = 'test-secret-for-accounting-auto-post-tests-32chars!!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockTransactionFindUnique = vi.fn();
const mockExpenseFindUnique = vi.fn();
const mockCashDrawerSessionFindUnique = vi.fn();
const mockLedgerAccountFindMany = vi.fn();
const mockLedgerAccountFindFirst = vi.fn();
const mockJournalEntryFindFirst = vi.fn();
const mockJournalEntryCreate = vi.fn();

vi.mock('@/lib/db', () => ({
  default: {
    transaction: {
      findUnique: (...args: unknown[]) => mockTransactionFindUnique(...args),
    },
    expense: {
      findUnique: (...args: unknown[]) => mockExpenseFindUnique(...args),
    },
    cashDrawerSession: {
      findUnique: (...args: unknown[]) => mockCashDrawerSessionFindUnique(...args),
    },
    ledgerAccount: {
      findMany: (...args: unknown[]) => mockLedgerAccountFindMany(...args),
      findFirst: (...args: unknown[]) => mockLedgerAccountFindFirst(...args),
    },
    journalEntry: {
      findFirst: (...args: unknown[]) => mockJournalEntryFindFirst(...args),
      create: (...args: unknown[]) => mockJournalEntryCreate(...args),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  postTransactionToLedger,
  postExpenseToLedger,
  postCashDrawerVarianceToLedger,
} from '@/lib/accounting/auto-post';

const SYSTEM_ACCOUNTS = [
  { id: 'acct-cash', code: '1000' },
  { id: 'acct-ar', code: '1010' },
  { id: 'acct-ap', code: '2000' },
  { id: 'acct-vat', code: '2010' },
  { id: 'acct-equity', code: '3000' },
  { id: 'acct-revenue', code: '4000' },
  { id: 'acct-discounts', code: '4010' },
  { id: 'acct-general-expense', code: '5000' },
  { id: 'acct-cogs', code: '5010' },
  { id: 'acct-over-short', code: '5020' },
];

function accountMapFor(codes: string[]) {
  return SYSTEM_ACCOUNTS.filter((a) => codes.includes(a.code));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLedgerAccountFindMany.mockImplementation(({ where }: { where: { code: { in: string[] } } }) =>
    Promise.resolve(accountMapFor(where.code.in))
  );
  mockJournalEntryFindFirst.mockResolvedValue(null);
  mockJournalEntryCreate.mockResolvedValue({ id: 'journal-entry-1' });
});

// ---------------------------------------------------------------------------
// postTransactionToLedger
// ---------------------------------------------------------------------------

describe('postTransactionToLedger', () => {
  it('posts a cash sale: debit Cash, credit Sales Revenue', async () => {
    mockTransactionFindUnique.mockResolvedValue({
      id: 'txn-1',
      tenantId: 'tenant-a',
      branchId: null,
      subtotal: 100,
      taxAmount: 0,
      discountAmount: 0,
      total: 100,
      paymentMethod: 'cash',
      status: 'completed',
      receiptNumber: 'R-001',
      createdAt: new Date(),
      userId: 'user-1',
    });

    await postTransactionToLedger('txn-1');

    expect(mockJournalEntryCreate).toHaveBeenCalledTimes(1);
    const call = mockJournalEntryCreate.mock.calls[0][0];
    expect(call.data.source).toBe('transaction');
    expect(call.data.sourceId).toBe('txn-1');
    const lines = call.data.lines.create;
    const debitLine = lines.find((l: { debit: number }) => l.debit > 0);
    const creditLine = lines.find((l: { credit: number }) => l.credit > 0);
    expect(debitLine.accountId).toBe('acct-cash');
    expect(debitLine.debit).toBe(100);
    expect(creditLine.accountId).toBe('acct-revenue');
    expect(creditLine.credit).toBe(100);
  });

  it('posts a card sale with tax and discount: balanced across four lines', async () => {
    mockTransactionFindUnique.mockResolvedValue({
      id: 'txn-2',
      tenantId: 'tenant-a',
      branchId: null,
      subtotal: 100,
      taxAmount: 12,
      discountAmount: 10,
      total: 102,
      paymentMethod: 'card',
      status: 'completed',
      receiptNumber: 'R-002',
      createdAt: new Date(),
      userId: 'user-1',
    });

    await postTransactionToLedger('txn-2');

    const call = mockJournalEntryCreate.mock.calls[0][0];
    const lines = call.data.lines.create as Array<{ accountId: string; debit: number; credit: number }>;

    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    expect(totalDebit).toBe(totalCredit);

    const cashLine = lines.find((l) => l.accountId === 'acct-cash');
    const revenueLine = lines.find((l) => l.accountId === 'acct-revenue');
    const vatLine = lines.find((l) => l.accountId === 'acct-vat');
    const discountLine = lines.find((l) => l.accountId === 'acct-discounts');

    expect(cashLine?.debit).toBe(102);
    expect(revenueLine?.credit).toBe(100);
    expect(vatLine?.credit).toBe(12);
    expect(discountLine?.debit).toBe(10);
  });

  it('posts an on-account sale using Accounts Receivable instead of Cash', async () => {
    mockTransactionFindUnique.mockResolvedValue({
      id: 'txn-3',
      tenantId: 'tenant-a',
      branchId: null,
      subtotal: 50,
      taxAmount: 0,
      discountAmount: 0,
      total: 50,
      paymentMethod: 'on_account',
      status: 'completed',
      receiptNumber: 'R-003',
      createdAt: new Date(),
      userId: 'user-1',
    });

    await postTransactionToLedger('txn-3');

    const call = mockJournalEntryCreate.mock.calls[0][0];
    const lines = call.data.lines.create as Array<{ accountId: string; debit: number }>;
    const debitLine = lines.find((l) => l.debit > 0);
    expect(debitLine?.accountId).toBe('acct-ar');
  });

  it('is idempotent: a second call for the same transactionId does not create a second entry', async () => {
    mockTransactionFindUnique.mockResolvedValue({
      id: 'txn-4',
      tenantId: 'tenant-a',
      branchId: null,
      subtotal: 100,
      taxAmount: 0,
      discountAmount: 0,
      total: 100,
      paymentMethod: 'cash',
      status: 'completed',
      receiptNumber: 'R-004',
      createdAt: new Date(),
      userId: 'user-1',
    });

    await postTransactionToLedger('txn-4');
    expect(mockJournalEntryCreate).toHaveBeenCalledTimes(1);

    // Simulate the entry now existing on the second call.
    mockJournalEntryFindFirst.mockResolvedValue({ id: 'journal-entry-1' });
    await postTransactionToLedger('txn-4');

    expect(mockJournalEntryCreate).toHaveBeenCalledTimes(1);
  });

  it('never throws when the transaction is missing', async () => {
    mockTransactionFindUnique.mockResolvedValue(null);
    await expect(postTransactionToLedger('missing-txn')).resolves.toBeUndefined();
    expect(mockJournalEntryCreate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// postExpenseToLedger
// ---------------------------------------------------------------------------

describe('postExpenseToLedger', () => {
  it('debits General Expenses and credits Cash for a cash expense with no mapped account', async () => {
    mockExpenseFindUnique.mockResolvedValue({
      id: 'exp-1',
      tenantId: 'tenant-a',
      name: 'Office supplies',
      amount: 45,
      date: new Date(),
      paymentMethod: 'cash',
      ledgerAccountId: null,
      userId: 'user-1',
    });

    await postExpenseToLedger('exp-1');

    const call = mockJournalEntryCreate.mock.calls[0][0];
    const lines = call.data.lines.create as Array<{ accountId: string; debit: number; credit: number }>;
    const debitLine = lines.find((l) => l.debit > 0);
    const creditLine = lines.find((l) => l.credit > 0);
    expect(debitLine.accountId).toBe('acct-general-expense');
    expect(creditLine.accountId).toBe('acct-cash');
    expect(debitLine.debit).toBe(45);
    expect(creditLine.credit).toBe(45);
  });

  it('credits Accounts Payable for a non-cash expense', async () => {
    mockExpenseFindUnique.mockResolvedValue({
      id: 'exp-2',
      tenantId: 'tenant-a',
      name: 'Utility bill',
      amount: 60,
      date: new Date(),
      paymentMethod: 'credit',
      ledgerAccountId: null,
      userId: 'user-1',
    });

    await postExpenseToLedger('exp-2');

    const call = mockJournalEntryCreate.mock.calls[0][0];
    const lines = call.data.lines.create as Array<{ accountId: string; credit: number }>;
    const creditLine = lines.find((l) => l.credit > 0);
    expect(creditLine.accountId).toBe('acct-ap');
  });

  it('is idempotent: a second call for the same expenseId does not create a second entry', async () => {
    mockExpenseFindUnique.mockResolvedValue({
      id: 'exp-3',
      tenantId: 'tenant-a',
      name: 'Rent',
      amount: 500,
      date: new Date(),
      paymentMethod: 'cash',
      ledgerAccountId: null,
      userId: 'user-1',
    });

    await postExpenseToLedger('exp-3');
    expect(mockJournalEntryCreate).toHaveBeenCalledTimes(1);

    mockJournalEntryFindFirst.mockResolvedValue({ id: 'journal-entry-1' });
    await postExpenseToLedger('exp-3');

    expect(mockJournalEntryCreate).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// postCashDrawerVarianceToLedger
// ---------------------------------------------------------------------------

describe('postCashDrawerVarianceToLedger', () => {
  it('posts a shortage: debit Cash Over/Short, credit Cash', async () => {
    mockCashDrawerSessionFindUnique.mockResolvedValue({
      id: 'session-1',
      tenantId: 'tenant-a',
      status: 'closed',
      shortage: 15,
      overage: 0,
      closingTime: new Date(),
      userId: 'user-1',
    });

    await postCashDrawerVarianceToLedger('session-1');

    const call = mockJournalEntryCreate.mock.calls[0][0];
    const lines = call.data.lines.create as Array<{ accountId: string; debit: number; credit: number }>;
    const debitLine = lines.find((l) => l.debit > 0);
    const creditLine = lines.find((l) => l.credit > 0);
    expect(debitLine.accountId).toBe('acct-over-short');
    expect(creditLine.accountId).toBe('acct-cash');
    expect(debitLine.debit).toBe(15);
  });

  it('posts an overage: debit Cash, credit Cash Over/Short', async () => {
    mockCashDrawerSessionFindUnique.mockResolvedValue({
      id: 'session-2',
      tenantId: 'tenant-a',
      status: 'closed',
      shortage: 0,
      overage: 8,
      closingTime: new Date(),
      userId: 'user-1',
    });

    await postCashDrawerVarianceToLedger('session-2');

    const call = mockJournalEntryCreate.mock.calls[0][0];
    const lines = call.data.lines.create as Array<{ accountId: string; debit: number; credit: number }>;
    const debitLine = lines.find((l) => l.debit > 0);
    const creditLine = lines.find((l) => l.credit > 0);
    expect(debitLine.accountId).toBe('acct-cash');
    expect(creditLine.accountId).toBe('acct-over-short');
    expect(creditLine.credit).toBe(8);
  });

  it('does not post when there is no variance', async () => {
    mockCashDrawerSessionFindUnique.mockResolvedValue({
      id: 'session-3',
      tenantId: 'tenant-a',
      status: 'closed',
      shortage: 0,
      overage: 0,
      closingTime: new Date(),
      userId: 'user-1',
    });

    await postCashDrawerVarianceToLedger('session-3');

    expect(mockJournalEntryCreate).not.toHaveBeenCalled();
  });

  it('is idempotent: a second call for the same sessionId does not create a second entry', async () => {
    mockCashDrawerSessionFindUnique.mockResolvedValue({
      id: 'session-4',
      tenantId: 'tenant-a',
      status: 'closed',
      shortage: 5,
      overage: 0,
      closingTime: new Date(),
      userId: 'user-1',
    });

    await postCashDrawerVarianceToLedger('session-4');
    expect(mockJournalEntryCreate).toHaveBeenCalledTimes(1);

    mockJournalEntryFindFirst.mockResolvedValue({ id: 'journal-entry-1' });
    await postCashDrawerVarianceToLedger('session-4');

    expect(mockJournalEntryCreate).toHaveBeenCalledTimes(1);
  });
});
