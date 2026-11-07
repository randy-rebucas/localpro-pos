process.env.JWT_SECRET = 'test-secret-for-products-list-tests-32chars!!';
process.env.MONGODB_URI = 'mongodb://test:test@localhost:27017/localpro-pos-test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/api-tenant', () => ({
  requireTenantAccess: vi.fn().mockResolvedValue({ tenantId: 'tenant-a', user: { userId: 'u1', role: 'cashier' } }),
}));
vi.mock('@/lib/permissions-server', () => ({ hasTenantPermission: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn(), AuditActions: {} }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn().mockReturnValue({ allowed: true }) }));
vi.mock('@/lib/subscription', () => ({ checkSubscriptionLimit: vi.fn(), SubscriptionService: {} }));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_key: string, fallback: string) => fallback),
}));

const chain = {
  populate: vi.fn(),
  sort: vi.fn(),
  collation: vi.fn(),
  skip: vi.fn(),
  limit: vi.fn(),
  lean: vi.fn(),
};
const mockFind = vi.fn();
const mockCount = vi.fn();
const mockDistinct = vi.fn();
vi.mock('@/models/Product', () => ({
  default: {
    find: (...args: unknown[]) => mockFind(...args),
    countDocuments: (...args: unknown[]) => mockCount(...args),
    distinct: (...args: unknown[]) => mockDistinct(...args),
  },
}));

const mockCategoryFind = vi.fn();
vi.mock('@/models/Category', () => ({
  default: { find: (...args: unknown[]) => mockCategoryFind(...args) },
}));

import { GET } from '@/app/api/products/route';
import { GET as getFilters } from '@/app/api/products/filters/route';

const list = (query: string) => GET(new NextRequest(`http://localhost/api/products?${query}`));
const categoryRows = (rows: unknown[]) => ({ select: () => ({ lean: vi.fn().mockResolvedValue(rows) }) });

beforeEach(() => {
  vi.clearAllMocks();
  for (const step of ['populate', 'sort', 'collation', 'skip', 'limit'] as const) chain[step].mockReturnValue(chain);
  chain.lean.mockResolvedValue([]);
  mockFind.mockReturnValue(chain);
  mockCount.mockResolvedValue(0);
  mockCategoryFind.mockReturnValue(categoryRows([]));
});

describe('GET /api/products', () => {
  it('keeps pinned products first by default', async () => {
    await list('page=1&limit=10');

    expect(chain.sort).toHaveBeenCalledWith({ pinned: -1, createdAt: -1 });
    expect(chain.collation).not.toHaveBeenCalled();
  });

  it('sorts names without regard to case', async () => {
    await list('page=1&limit=10&sort=name');

    expect(chain.sort).toHaveBeenCalledWith({ name: 1, _id: 1 });
    expect(chain.collation).toHaveBeenCalledWith({ locale: 'en', strength: 2 });
  });

  it('sorts by price and stock in either direction', async () => {
    await list('page=1&limit=10&sort=price_desc');
    expect(chain.sort).toHaveBeenLastCalledWith({ price: -1, _id: 1 });

    await list('page=1&limit=10&sort=stock_asc');
    expect(chain.sort).toHaveBeenLastCalledWith({ stock: 1, _id: 1 });
  });

  it('ignores a sort it does not know', async () => {
    await list('page=1&limit=10&sort=%24where');

    expect(chain.sort).toHaveBeenCalledWith({ pinned: -1, createdAt: -1 });
  });

  it('matches a category by its text or its Category record, within the tenant', async () => {
    mockCategoryFind.mockReturnValue(categoryRows([{ _id: 'cat-1' }]));

    await list('categoryName=Snacks');

    expect(mockCategoryFind).toHaveBeenCalledWith({ tenantId: 'tenant-a', name: 'Snacks' });
    expect(mockFind.mock.calls[0][0]).toMatchObject({
      tenantId: 'tenant-a',
      $and: [{ $or: [{ category: 'Snacks' }, { categoryId: { $in: ['cat-1'] } }] }],
    });
  });

  it('applies search and category together, not either one', async () => {
    await list('search=chips&categoryName=Snacks');
    const query = mockFind.mock.calls[0][0];

    expect(query.$or).toBeUndefined();
    expect(query.$and).toHaveLength(2);
    expect(query.$and[0].$or[0]).toHaveProperty('name');
    expect(query.$and[1].$or).toEqual([{ category: 'Snacks' }]);
  });
});

describe('GET /api/products/filters', () => {
  it('combines the Category list with text categories on products', async () => {
    mockCategoryFind.mockReturnValue(categoryRows([{ name: 'Drinks' }, { name: 'Snacks' }]));
    mockDistinct.mockResolvedValue(['Snacks', 'Apparel', '', null]);

    const res = await getFilters(new NextRequest('http://localhost/api/products/filters'));
    const body = await res.json();

    expect(body.data.categories).toEqual(['Apparel', 'Drinks', 'Snacks']);
    expect(mockDistinct).toHaveBeenCalledWith('category', { tenantId: 'tenant-a' });
  });
});
