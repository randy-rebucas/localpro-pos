process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/models/Transaction', () => ({
  default: { aggregate: vi.fn(), find: vi.fn() },
}));

vi.mock('@/models/Expense', () => ({
  default: { aggregate: vi.fn(), find: vi.fn() },
}));

vi.mock('@/models/CashDrawerSession', () => ({
  default: { find: vi.fn() },
}));

vi.mock('@/models/Product', () => ({
  default: { find: vi.fn() },
}));

import Transaction from '@/models/Transaction';
import Expense from '@/models/Expense';
import CashDrawerSession from '@/models/CashDrawerSession';
import Product from '@/models/Product';
import { getSalesReport, getProductPerformance, getCashDrawerReports } from '@/lib/analytics';

/* eslint-disable @typescript-eslint/no-explicit-any */
const TransactionMock = Transaction as any;
const ExpenseMock = Expense as any;
const CashDrawerSessionMock = CashDrawerSession as any;
const ProductMock = Product as any;

const TENANT = '507f1f77bcf86cd799439011';
const P1 = '507f1f77bcf86cd799439021';
const P2 = '507f1f77bcf86cd799439022';
const P3 = '507f1f77bcf86cd799439023';

function selectLean(docs: unknown) {
  return { select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(docs) }) };
}

describe('getSalesReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const byMethod = [
    { _id: 'cash', sales: 100, count: 2 },
    { _id: 'card', sales: 50, count: 1 },
    { _id: 'digital', sales: 10, count: 1 },
    { _id: 'tap_to_pay', sales: 20, count: 1 },
    { _id: 'wallet', sales: 30, count: 1 },
    { _id: 'qr_code', sales: 40, count: 1 },
    { _id: 'bnpl', sales: 5, count: 1 },
    { _id: 'on_account', sales: 45, count: 1 },
    { _id: null, sales: 0, count: 1 },
  ];

  it('maps facet rows to totals and payment method buckets', async () => {
    TransactionMock.aggregate.mockResolvedValue([
      { byMethod, byDay: [{ _id: '2026-11-01', sales: 300, transactions: 10 }] },
    ]);
    const start = new Date('2026-11-01T00:00:00Z');
    const end = new Date('2026-11-02T00:00:00Z');

    const report = await getSalesReport(TENANT, 'daily', start, end);

    expect(report.totalSales).toBe(300);
    expect(report.totalTransactions).toBe(10);
    expect(report.averageTransaction).toBe(30);
    expect(report.salesByPaymentMethod).toEqual({
      cash: 100,
      card: 50,
      digital: 10 + 20 + 30 + 40 + 5,
      on_account: 45,
    });
    expect(report.salesByDay).toEqual([{ date: '2026-11-01', sales: 300, transactions: 10 }]);
    expect(report.startDate).toBe(start);
    expect(report.endDate).toBe(end);

    const pipeline = TransactionMock.aggregate.mock.calls[0][0];
    expect(String(pipeline[0].$match.tenantId)).toBe(TENANT);
    expect(pipeline[0].$match.status).toBe('completed');
    expect(pipeline[1].$facet).toHaveProperty('byDay');
  });

  it('includes byDay facet for weekly reports', async () => {
    TransactionMock.aggregate.mockResolvedValue([
      { byMethod: [{ _id: 'cash', sales: 10, count: 1 }], byDay: [{ _id: '2026-11-02', sales: 10, transactions: 1 }] },
    ]);
    const report = await getSalesReport(TENANT, 'weekly');
    expect(TransactionMock.aggregate.mock.calls[0][0][1].$facet).toHaveProperty('byDay');
    expect(report.salesByDay).toHaveLength(1);
  });

  it('omits byDay for monthly reports', async () => {
    TransactionMock.aggregate.mockResolvedValue([{ byMethod: [{ _id: 'cash', sales: 10, count: 1 }] }]);

    const report = await getSalesReport(TENANT, 'monthly');

    expect(TransactionMock.aggregate.mock.calls[0][0][1].$facet).not.toHaveProperty('byDay');
    expect(report.salesByDay).toBeUndefined();
    const now = new Date();
    expect(report.startDate).toEqual(new Date(now.getFullYear(), now.getMonth(), 1));
  });

  it('leaves salesByDay undefined when the daily facet is empty', async () => {
    TransactionMock.aggregate.mockResolvedValue([{ byMethod: [], byDay: [] }]);
    const report = await getSalesReport(TENANT, 'daily');
    expect(report.salesByDay).toBeUndefined();
  });

  it('returns zeros when there are no transactions', async () => {
    TransactionMock.aggregate.mockResolvedValue([]);

    const report = await getSalesReport(TENANT, 'daily');

    expect(report.totalSales).toBe(0);
    expect(report.totalTransactions).toBe(0);
    expect(report.averageTransaction).toBe(0);
    expect(report.salesByPaymentMethod).toEqual({ cash: 0, card: 0, digital: 0, on_account: 0 });
  });
});

describe('getProductPerformance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefers current product names, falls back to item name, and ranks 1..n', async () => {
    TransactionMock.aggregate.mockResolvedValue([
      { _id: P1, itemName: 'Old Coffee', totalRevenue: 500, quantitySold: 10 },
      { _id: P2, itemName: 'Deleted Tea', totalRevenue: 300, quantitySold: 0 },
      { _id: null, itemName: 'Custom item', totalRevenue: 100, quantitySold: 4 },
      { _id: P3, itemName: null, totalRevenue: 50, quantitySold: 1 },
    ]);
    ProductMock.find.mockReturnValue(selectLean([{ _id: P1, name: 'New Coffee' }]));

    const result = await getProductPerformance(TENANT, new Date(0), new Date(), 4);

    expect(ProductMock.find).toHaveBeenCalledTimes(1);
    expect(ProductMock.find).toHaveBeenCalledWith({ _id: { $in: [P1, P2, P3] }, tenantId: TENANT });

    expect(result.map((r) => r.productName)).toEqual(['New Coffee', 'Deleted Tea', 'Custom item', 'Unknown']);
    expect(result.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    expect(result.map((r) => r.productId)).toEqual([P1, P2, '', P3]);
    expect(result[0]).toMatchObject({ totalRevenue: 500, quantitySold: 10, totalSold: 10, averagePrice: 50 });
    expect(result[1].averagePrice).toBe(0);

    const pipeline = TransactionMock.aggregate.mock.calls[0][0];
    expect(pipeline[pipeline.length - 1]).toEqual({ $limit: 4 });
  });

  it('skips Product.find when there are no rows', async () => {
    TransactionMock.aggregate.mockResolvedValue([]);
    const result = await getProductPerformance(TENANT, new Date(0), new Date());
    expect(result).toEqual([]);
    expect(ProductMock.find).not.toHaveBeenCalled();
  });
});

describe('getCashDrawerReports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockSessions(sessions: unknown[]) {
    CashDrawerSessionMock.find.mockReturnValue({
      populate: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(sessions) }),
      }),
    });
  }

  it('returns [] without querying transactions/expenses when there are no sessions', async () => {
    mockSessions([]);
    const result = await getCashDrawerReports(TENANT, new Date(0), new Date());
    expect(result).toEqual([]);
    expect(TransactionMock.find).not.toHaveBeenCalled();
    expect(ExpenseMock.find).not.toHaveBeenCalled();
  });

  it('issues one Transaction.find and one Expense.find and attributes by session time window', async () => {
    const s1Open = new Date('2026-11-01T08:00:00Z');
    const s1Close = new Date('2026-11-01T12:00:00Z');
    const s2Open = new Date('2026-11-01T13:00:00Z');
    const s2Close = new Date('2026-11-01T17:00:00Z');

    mockSessions([
      {
        _id: { toString: () => 's2' },
        userId: { _id: 'u2', name: 'Bob', toString: () => 'u2' },
        openingTime: s2Open,
        closingTime: s2Close,
        openingAmount: 200,
        closingAmount: 0,
        status: 'closed',
      },
      {
        _id: { toString: () => 's1' },
        userId: { _id: 'u1', name: 'Alice', toString: () => 'u1' },
        openingTime: s1Open,
        closingTime: s1Close,
        openingAmount: 100,
        closingAmount: 50,
        status: 'closed',
      },
    ]);

    TransactionMock.find.mockReturnValue(
      selectLean([
        { total: 10, createdAt: new Date('2026-11-01T09:00:00Z') }, // s1
        { total: 15, createdAt: new Date('2026-11-01T12:00:00Z') }, // s1 (boundary, inclusive)
        { total: 40, createdAt: new Date('2026-11-01T14:00:00Z') }, // s2
        { total: 99, createdAt: new Date('2026-11-01T12:30:00Z') }, // gap -> neither
      ])
    );
    ExpenseMock.find.mockReturnValue(
      selectLean([
        { amount: 5, date: new Date('2026-11-01T10:00:00Z') }, // s1
        { amount: 7, date: new Date('2026-11-01T16:00:00Z') }, // s2
      ])
    );

    const result = await getCashDrawerReports(TENANT, new Date('2026-11-01T00:00:00Z'), new Date('2026-11-02T00:00:00Z'));

    expect(TransactionMock.find).toHaveBeenCalledTimes(1);
    expect(ExpenseMock.find).toHaveBeenCalledTimes(1);

    // The single query spans from the earliest open to the latest close
    const txFilter = TransactionMock.find.mock.calls[0][0];
    expect(txFilter).toMatchObject({ tenantId: TENANT, paymentMethod: 'cash', status: 'completed' });
    expect(txFilter.createdAt.$gte).toEqual(s1Open);
    expect(txFilter.createdAt.$lte).toEqual(s2Close);
    const expFilter = ExpenseMock.find.mock.calls[0][0];
    expect(expFilter).toMatchObject({ tenantId: TENANT, paymentMethod: 'cash' });
    expect(expFilter.date.$gte).toEqual(s1Open);
    expect(expFilter.date.$lte).toEqual(s2Close);

    expect(result).toHaveLength(2);
    const [r2, r1] = result;
    expect(r2).toMatchObject({ sessionId: 's2', userId: 'u2', userName: 'Bob', cashSales: 40, cashExpenses: 7 });
    expect(r2.netCash).toBe(200 + 40 - 7 - 0);
    expect(r1).toMatchObject({ sessionId: 's1', userId: 'u1', userName: 'Alice', cashSales: 25, cashExpenses: 5 });
    expect(r1.netCash).toBe(100 + 25 - 5 - 50);
  });

  it('treats an open session as running until now', async () => {
    const open = new Date(Date.now() - 60 * 60 * 1000);
    mockSessions([
      {
        _id: { toString: () => 's1' },
        userId: { toString: () => 'u1' },
        openingTime: open,
        openingAmount: 0,
        status: 'open',
      },
    ]);
    TransactionMock.find.mockReturnValue(
      selectLean([{ total: 12, createdAt: new Date(Date.now() - 10 * 60 * 1000) }])
    );
    ExpenseMock.find.mockReturnValue(selectLean([]));

    const [r] = await getCashDrawerReports(TENANT, new Date(0), new Date());

    expect(r.cashSales).toBe(12);
    expect(r.userName).toBe('Unknown');
    expect(r.netCash).toBe(12);
  });
});
