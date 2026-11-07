process.env.JWT_SECRET = 'test-secret-for-transactions-feed-tests-32chars!!';
process.env.MONGODB_URI = 'mongodb://test:test@localhost:27017/localpro-pos-test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';

const TENANT = '64b000000000000000000001';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

const mockCheckRateLimit = vi.fn();
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_key: string, fallback: string) => fallback),
}));

const mockRequireTenantAccess = vi.fn();
vi.mock('@/lib/api-tenant', () => ({
  requireTenantAccess: (...args: unknown[]) => mockRequireTenantAccess(...args),
}));

const mockHasTenantPermission = vi.fn();
vi.mock('@/lib/permissions-server', () => ({
  hasTenantPermission: (...args: unknown[]) => mockHasTenantPermission(...args),
}));

const mockTxAggregate = vi.fn();
const mockExpenseAggregate = vi.fn();
const mockTxCount = vi.fn();
const mockExpenseCount = vi.fn();
const mockTxFind = vi.fn();
const mockExpenseFind = vi.fn();

vi.mock('@/models/Transaction', () => ({
  default: {
    aggregate: (...args: unknown[]) => mockTxAggregate(...args),
    countDocuments: (...args: unknown[]) => mockTxCount(...args),
    find: (...args: unknown[]) => mockTxFind(...args),
  },
}));

vi.mock('@/models/Expense', () => ({
  default: {
    collection: { name: 'expenses' },
    aggregate: (...args: unknown[]) => mockExpenseAggregate(...args),
    countDocuments: (...args: unknown[]) => mockExpenseCount(...args),
    find: (...args: unknown[]) => mockExpenseFind(...args),
  },
}));

import { GET } from '@/app/api/transactions/feed/route';
import { buildFeedMatches, buildFeedPipeline, toFeedExportRow } from '@/lib/transactions-feed';

const request = (query = '') => new NextRequest(`http://localhost/api/transactions/feed?${query}`);
const docs = (rows: unknown[]) => ({ populate: () => ({ lean: vi.fn().mockResolvedValue(rows) }) });

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckRateLimit.mockReturnValue({ allowed: true, retryAfter: 0 });
  mockRequireTenantAccess.mockResolvedValue({ tenantId: TENANT, user: { role: 'cashier', userId: 'u1', tenantId: TENANT } });
  mockHasTenantPermission.mockResolvedValue(true);
  mockTxCount.mockResolvedValue(0);
  mockExpenseCount.mockResolvedValue(0);
  mockTxAggregate.mockResolvedValue([]);
  mockExpenseAggregate.mockResolvedValue([]);
  mockTxFind.mockReturnValue(docs([]));
  mockExpenseFind.mockReturnValue(docs([]));
});

describe('buildFeedPipeline', () => {
  const options = { tenantId: TENANT, expenseCollection: 'expenses', skip: 20, limit: 10 };

  it('scopes both sides of the union to the tenant, as an ObjectId', () => {
    const pipeline = buildFeedPipeline({ ...options, type: 'all' }) as Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    const union = pipeline.find((stage) => stage.$unionWith)!.$unionWith;

    for (const match of [pipeline[0].$match, union.pipeline[0].$match]) {
      expect(match.tenantId).toBeInstanceOf(Types.ObjectId);
      expect(String(match.tenantId)).toBe(TENANT);
      expect(match.isActive).toEqual({ $ne: false });
    }
  });

  it('keeps enough of each side to fill a deep page', () => {
    const pipeline = buildFeedPipeline({ ...options, type: 'all' }) as Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    const union = pipeline.find((stage) => stage.$unionWith)!.$unionWith;

    expect(pipeline[2].$limit).toBe(30);
    expect(union.pipeline[2].$limit).toBe(30);
    expect(pipeline.slice(-2)).toEqual([{ $skip: 20 }, { $limit: 10 }]);
  });

  it('does not touch the other collection for a single type', () => {
    for (const type of ['transactions', 'expenses'] as const) {
      const pipeline = buildFeedPipeline({ ...options, type }) as unknown as Record<string, unknown>[];
      expect(pipeline.some((stage) => stage.$unionWith)).toBe(false);
    }
  });
});

describe('buildFeedMatches', () => {
  it('keeps expenses for filters they support, on their own date field', () => {
    const startDate = new Date('2026-11-01T00:00:00Z');
    const matches = buildFeedMatches({ startDate, paymentMethod: 'cash' });

    expect(matches.sales).toEqual({ paymentMethod: 'cash', createdAt: { $gte: startDate } });
    expect(matches.expenses).toEqual({ paymentMethod: 'cash', date: { $gte: startDate } });
  });

  it('drops expenses for sale-only filters', () => {
    expect(buildFeedMatches({ status: 'refunded' }).expenses).toBeNull();
    expect(buildFeedMatches({ branchId: new Types.ObjectId(TENANT) }).expenses).toBeNull();
  });

  it('treats search text as literal, not as a pattern', () => {
    const { sales } = buildFeedMatches({ search: 'OR-1.*' });
    const [{ receiptNumber }] = sales.$or as { receiptNumber: RegExp }[];

    expect(receiptNumber.test('OR-1.*')).toBe(true);
    expect(receiptNumber.test('OR-1234')).toBe(false);
  });

  it('searches customers by the ids it was given and expenses by name or description', () => {
    const id = new Types.ObjectId(TENANT);
    const { sales, expenses } = buildFeedMatches({ search: 'ana', customerIds: [id] });

    expect(sales.$or).toContainEqual({ customerId: { $in: [id] } });
    expect((expenses!.$or as object[]).length).toBe(2);
  });

  it('cannot widen a pipeline past the tenant', () => {
    const other = new Types.ObjectId();
    const pipeline = buildFeedPipeline({
      tenantId: TENANT, type: 'all', expenseCollection: 'expenses', skip: 0, limit: 10,
      saleMatch: { tenantId: other }, expenseMatch: { tenantId: other },
    }) as Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    const union = pipeline.find((stage) => stage.$unionWith)!.$unionWith;

    expect(String(pipeline[0].$match.tenantId)).toBe(TENANT);
    expect(String(union.pipeline[0].$match.tenantId)).toBe(TENANT);
  });
});

describe('toFeedExportRow', () => {
  const date = '2026-11-07T00:00:00.000Z';

  it('neutralises text a spreadsheet would run as a formula', () => {
    const row = toFeedExportRow({ type: 'expense', date, data: { _id: 'e1', name: '=HYPERLINK("http://x")', amount: 5, paymentMethod: 'cash', userId: { name: '@evil' } } });

    expect(row.description.startsWith("'=")).toBe(true);
    expect(row.cashier).toBe("'@evil");
  });

  it('shows an expense as money out', () => {
    expect(toFeedExportRow({ type: 'expense', date, data: { _id: 'e1', amount: 50 } }).total).toBe(-50);
  });

  it('flattens a sale, with the void reason and customer name', () => {
    const row = toFeedExportRow({ type: 'transaction', date, data: { _id: 'abc', receiptNumber: 'OR-1', status: 'cancelled', voidReason: 'Wrong item', items: [{}, {}], total: 20, customerId: { firstName: 'Ana', lastName: 'Cruz' } } });

    expect(row).toMatchObject({ receipt: 'OR-1', status: 'cancelled', description: 'Wrong item', items: 2, total: 20, customer: 'Ana Cruz' });
  });
});

describe('GET /api/transactions/feed', () => {
  it('rejects a rate limited caller before checking auth', async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: false, retryAfter: 30 });
    const res = await GET(request());
    expect(res.status).toBe(429);
    expect(mockRequireTenantAccess).not.toHaveBeenCalled();
  });

  it('rejects a missing session', async () => {
    mockRequireTenantAccess.mockRejectedValue(new Error('Unauthorized: Authentication required'));
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(mockTxAggregate).not.toHaveBeenCalled();
  });

  it('requires transactions.view', async () => {
    mockHasTenantPermission.mockResolvedValue(false);
    const res = await GET(request());
    expect(res.status).toBe(403);
    expect(mockHasTenantPermission).toHaveBeenCalledWith('cashier', TENANT, 'transactions.view');
    expect(mockTxAggregate).not.toHaveBeenCalled();
  });

  it('returns sales and expenses in feed order, loading documents within the tenant only', async () => {
    const when = '2026-11-07T00:00:00.000Z';
    mockTxAggregate.mockResolvedValue([
      { _id: 'e1', kind: 'expense', when },
      { _id: 't1', kind: 'transaction', when },
    ]);
    mockTxFind.mockReturnValue(docs([{ _id: 't1', total: 10 }]));
    mockExpenseFind.mockReturnValue(docs([{ _id: 'e1', amount: 5 }]));
    mockTxCount.mockResolvedValue(25);
    mockExpenseCount.mockResolvedValue(3);

    const res = await GET(request('page=2&limit=10'));
    const body = await res.json();

    expect(body.data.map((entry: { type: string }) => entry.type)).toEqual(['expense', 'transaction']);
    expect(body.data[0].data.amount).toBe(5);
    expect(body.pagination).toEqual({ total: 28, page: 2, limit: 10, pages: 3 });
    expect(mockTxFind.mock.calls[0][0].tenantId).toBe(TENANT);
    expect(mockExpenseFind.mock.calls[0][0].tenantId).toBe(TENANT);
  });

  it('counts and queries only expenses for the expenses view', async () => {
    mockExpenseCount.mockResolvedValue(12);
    const res = await GET(request('type=expenses'));
    const body = await res.json();

    expect(mockExpenseAggregate).toHaveBeenCalled();
    expect(mockTxAggregate).not.toHaveBeenCalled();
    expect(mockTxCount).not.toHaveBeenCalled();
    expect(body.pagination.pages).toBe(2);
  });

  it('caps the page size and treats an unknown type as all', async () => {
    const res = await GET(request('limit=9999&type=nonsense'));
    const body = await res.json();
    expect(body.pagination.limit).toBe(50);
    expect(mockTxAggregate).toHaveBeenCalled();
  });

  it('returns nothing for the expenses view with a sale-only filter', async () => {
    const res = await GET(request('type=expenses&status=refunded'));
    const body = await res.json();

    expect(body.data).toEqual([]);
    expect(mockExpenseAggregate).not.toHaveBeenCalled();
    expect(mockTxAggregate).not.toHaveBeenCalled();
  });

  it('drops expenses from the all view when a sale-only filter is set', async () => {
    await GET(request('status=refunded'));
    const pipeline = mockTxAggregate.mock.calls[0][0] as Record<string, unknown>[];

    expect(pipeline.some((stage) => stage.$unionWith)).toBe(false);
    expect(mockExpenseCount).not.toHaveBeenCalled();
  });

  it('ignores filter values it does not recognise', async () => {
    await GET(request('status=%7B%22%24ne%22%3Anull%7D&userId=not-an-id&paymentMethod=bitcoin&startDate=tomorrow'));
    const match = (mockTxAggregate.mock.calls[0][0] as Record<string, any>[])[0].$match; // eslint-disable-line @typescript-eslint/no-explicit-any

    expect(Object.keys(match).sort()).toEqual(['isActive', 'tenantId']);
  });

  it('skips a reference whose document is gone', async () => {
    mockTxAggregate.mockResolvedValue([{ _id: 't9', kind: 'transaction', when: new Date() }]);
    const res = await GET(request());
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});
