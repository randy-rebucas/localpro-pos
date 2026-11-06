process.env.JWT_SECRET = 'test-secret-for-query-bounds-tests-32chars!!';
process.env.MONGODB_URI = 'mongodb://test:test@localhost:27017/localpro-pos-test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import mongoose from 'mongoose';

vi.mock('@/lib/mongodb', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_key: string, fallback: string) => fallback),
}));

vi.mock('@/lib/api-tenant', () => ({
  requireTenantAccess: vi.fn().mockResolvedValue({
    tenantId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    user: { userId: 'user-a', tenantId: 'aaaaaaaaaaaaaaaaaaaaaaaa', role: 'owner' },
  }),
}));

vi.mock('@/lib/permissions-server', () => ({
  hasTenantPermission: vi.fn().mockResolvedValue(true),
}));

const mockAggregateOption = vi.fn();
const mockAggregate = vi.fn();
const mockCountMaxTime = vi.fn();
const mockCount = vi.fn();
const mockTransactionFind = vi.fn();
vi.mock('@/models/Transaction', () => ({
  default: {
    aggregate: (...args: unknown[]) => mockAggregate(...args),
    countDocuments: (...args: unknown[]) => mockCount(...args),
    find: (...args: unknown[]) => mockTransactionFind(...args),
  },
}));

const mockMovementAggregate = vi.fn();
vi.mock('@/models/StockMovement', () => ({
  default: { aggregate: (...args: unknown[]) => mockMovementAggregate(...args) },
}));

const mockCustomerFindOne = vi.fn();
vi.mock('@/models/Customer', () => ({
  default: { findOne: (...args: unknown[]) => mockCustomerFindOne(...args) },
}));

const mockLoyaltyFind = vi.fn();
vi.mock('@/models/LoyaltyTransaction', () => ({
  default: { find: (...args: unknown[]) => mockLoyaltyFind(...args) },
}));

vi.mock('@/lib/subscription', () => ({
  checkFeatureAccess: vi.fn().mockResolvedValue(undefined),
}));

const mockBundleFind = vi.fn();
vi.mock('@/models/ProductBundle', () => ({
  default: { find: (...args: unknown[]) => mockBundleFind(...args) },
}));

const mockProductFind = vi.fn();
const mockTenantFindOne = vi.fn();
vi.mock('@/models/Product', () => ({
  default: { find: (...args: unknown[]) => mockProductFind(...args) },
}));
vi.mock('@/models/Tenant', () => ({
  default: { findOne: (...args: unknown[]) => mockTenantFindOne(...args) },
}));

import { escapeRegex } from '@/lib/query-utils';
import { GET as bundleAnalytics } from '@/app/api/bundles/analytics/route';
import { GET as listServices } from '@/app/api/services/route';
import { GET as upsell } from '@/app/api/insights/upsell/route';
import { GET as stockPredictions } from '@/app/api/insights/stock-predictions/route';
import { GET as customerProfile } from '@/app/api/customers/[id]/profile/route';

const get = (url: string) => new NextRequest(new URL(url, 'http://localhost'));

const TENANT = 'aaaaaaaaaaaaaaaaaaaaaaaa';

function expectTenantObjectId(match: { tenantId: unknown }) {
  expect(match.tenantId).toBeInstanceOf(mongoose.Types.ObjectId);
  expect(String(match.tenantId)).toBe(TENANT);
}

describe('aggregate tenant casting', () => {
  beforeEach(() => vi.clearAllMocks());

  it('upsell matches on an ObjectId and caches per cart, in any item order', async () => {
    const [p1, p2, suggested] = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
    const exec = vi.fn().mockResolvedValue([{ _id: suggested, score: 4 }]);
    mockAggregate.mockReturnValue({ option: vi.fn().mockReturnValue({ exec }) });
    mockProductFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([{ _id: suggested, name: 'Fries', price: 50, stock: 3 }]),
    });

    const first = await upsell(get(`/api/insights/upsell?productIds=${p1},${p2}`));
    await upsell(get(`/api/insights/upsell?productIds=${p2},${p1}`));

    expect((await first.json()).data[0]).toMatchObject({ name: 'Fries' });
    expectTenantObjectId(mockAggregate.mock.calls[0][0][0].$match);
    expect(mockAggregate).toHaveBeenCalledTimes(1);
    expect(mockProductFind).toHaveBeenCalledTimes(2); // stock stays live
  });

  it('stock predictions match on ObjectIds, including the branch', async () => {
    const branch = new mongoose.Types.ObjectId();
    mockMovementAggregate.mockResolvedValue([]);

    await stockPredictions(get(`/api/insights/stock-predictions?branchId=${branch}`));

    const match = mockMovementAggregate.mock.calls[0][0][0].$match;
    expectTenantObjectId(match);
    expect(match.branchId).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(String(match.branchId)).toBe(String(branch));
  });

  it('stock predictions return nothing for an invalid branch instead of failing', async () => {
    const res = await stockPredictions(get('/api/insights/stock-predictions?branchId=not-an-id'));

    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([]);
    expect(mockMovementAggregate).not.toHaveBeenCalled();
  });

  it('customer profile stats match on an ObjectId', async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const list = { sort: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) }) };
    mockCustomerFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: id, lastPurchaseDate: new Date() }) });
    mockTransactionFind.mockReturnValue(list);
    mockLoyaltyFind.mockReturnValue(list);
    mockAggregate.mockResolvedValue([{ orderCount: 3, totalSpent: 600 }]);

    const res = await customerProfile(get(`/api/customers/${id}/profile`), { params: Promise.resolve({ id }) });

    expect(res.status).toBe(200);
    expectTenantObjectId(mockAggregate.mock.calls[0][0][0].$match);
    expectTenantObjectId(mockAggregate.mock.calls[1][0][0].$match);
  });
});

describe('escapeRegex', () => {
  it('makes a catastrophic pattern match literally', () => {
    const escaped = escapeRegex('(a+)+$');
    expect(escaped).toBe('\\(a\\+\\)\\+\\$');
    expect(new RegExp(escaped).test('(a+)+$')).toBe(true);
    expect(new RegExp(escaped).test('aaaa')).toBe(false);
  });
});

describe('GET /api/services', () => {
  it('escapes search input, hides inactive services and bounds results', async () => {
    const limit = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    mockTenantFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: 'tenant-a' }) });
    mockProductFind.mockReturnValue({ select: vi.fn().mockReturnValue({ sort: vi.fn().mockReturnValue({ limit }) }) });

    const res = await listServices(get('/api/services?tenantId=shop&search=(a%2B)%2B'));

    expect(res.status).toBe(200);
    const filter = mockProductFind.mock.calls[0][0];
    expect(filter.tenantId).toBe('tenant-a');
    expect(filter.isActive).toEqual({ $ne: false });
    expect(filter.$or[0].name.$regex).toBe('\\(a\\+\\)\\+');
    expect(limit).toHaveBeenCalledWith(200);
  });
});

describe('GET /api/bundles/analytics', () => {
  const bundleA = new mongoose.Types.ObjectId();
  const bundleB = new mongoose.Types.ObjectId();

  beforeEach(() => {
    vi.clearAllMocks();
    mockBundleFind.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          { _id: bundleA, name: 'Sold', price: 100 },
          { _id: bundleB, name: 'Unsold', price: 50 },
        ]),
      }),
    });
    mockAggregateOption.mockResolvedValue([
      { _id: bundleA, totalSales: 300, totalQuantity: 3, transactionCount: 2 },
    ]);
    mockAggregate.mockReturnValue({ option: mockAggregateOption });
    mockCountMaxTime.mockResolvedValue(2);
    mockCount.mockReturnValue({ maxTimeMS: mockCountMaxTime });
  });

  it('reports sales from items.product, where checkout stores the bundle id', async () => {
    const res = await bundleAnalytics(get('/api/bundles/analytics?startDate=2026-01-01&endDate=2026-01-31'));
    const { data } = await res.json();

    expect(res.status).toBe(200);
    expect(data.analytics[0]).toMatchObject({ bundleName: 'Sold', totalSales: 300, totalQuantity: 3, transactionCount: 2 });
    expect(data.analytics[1]).toMatchObject({ bundleName: 'Unsold', totalSales: 0, revenuePerUnit: 50 });
    expect(data.summary).toMatchObject({ totalSales: 300, totalTransactions: 2 });

    const match = mockAggregate.mock.calls[0][0][0].$match;
    expect(match['items.product'].$in).toEqual([bundleA, bundleB]);
  });

  it('scopes the aggregate to the session tenant as an ObjectId', async () => {
    await bundleAnalytics(get('/api/bundles/analytics'));

    const match = mockAggregate.mock.calls[0][0][0].$match;
    expect(match.tenantId).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(match.tenantId.toString()).toBe('aaaaaaaaaaaaaaaaaaaaaaaa');
  });

  it('defaults to a bounded range when no dates are given', async () => {
    await bundleAnalytics(get('/api/bundles/analytics'));

    const { createdAt } = mockAggregate.mock.calls[0][0][0].$match;
    const days = (createdAt.$lte.getTime() - createdAt.$gte.getTime()) / 86_400_000;
    expect(days).toBeGreaterThan(89);
    expect(days).toBeLessThan(92);
  });
});
