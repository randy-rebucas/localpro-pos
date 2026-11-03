/**
 * POS product search is local-first: GET /api/products serves a slim catalog with delta sync
 * (`view=pos`, `updatedSince`) and count-free paging (`count=0`), and the register matches
 * keystrokes against that catalog in memory (searchCatalog).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  countDocuments: vi.fn(),
  requireTenantAccess: vi.fn(),
}));

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/models/Category', () => ({}));
vi.mock('@/models/Product', () => ({
  default: { find: mocks.find, countDocuments: mocks.countDocuments },
  PRODUCT_NAME_COLLATION: { locale: 'en', strength: 2 },
}));
vi.mock('@/lib/api-tenant', () => ({ requireTenantAccess: mocks.requireTenantAccess }));
// POST-only dependencies of the route module (pull in server-only dictionaries, Redis, …)
vi.mock('@/lib/validation-translations', () => ({ getValidationTranslatorFromRequest: vi.fn() }));
vi.mock('@/lib/validation', () => ({ validateAndSanitize: vi.fn(), validateProduct: vi.fn() }));
vi.mock('@/lib/subscription', () => ({ checkSubscriptionLimit: vi.fn(), SubscriptionService: {} }));
vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn(), AuditActions: {} }));
vi.mock('@/lib/permissions-server', () => ({ hasTenantPermission: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }));

import { GET } from '@/app/api/products/route';
import { searchCatalog, type PosProduct } from '@/hooks/usePosProducts';

/** Chainable query stub: every builder method returns itself, `lean()` resolves the rows. */
function queryReturning(rows: unknown[]) {
  const q = {
    select: vi.fn(),
    populate: vi.fn(),
    sort: vi.fn(),
    skip: vi.fn(),
    limit: vi.fn(),
    lean: vi.fn().mockResolvedValue(rows),
  };
  q.select.mockReturnValue(q);
  q.populate.mockReturnValue(q);
  q.sort.mockReturnValue(q);
  q.skip.mockReturnValue(q);
  q.limit.mockReturnValue(q);
  return q;
}

const get = (qs: string) => GET(new NextRequest(`http://localhost/api/products?tenant=acme&${qs}`));

describe('GET /api/products — POS catalog modes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireTenantAccess.mockResolvedValue({ tenantId: 'tenant-1' });
  });

  it('view=pos returns the slim catalog of active products with a syncedAt, no populate', async () => {
    const q = queryReturning([{ _id: 'p1' }]);
    mocks.find.mockReturnValue(q);

    const res = (await get('view=pos')) as NextResponse;
    const body = await res.json();

    expect(mocks.find).toHaveBeenCalledWith({ tenantId: 'tenant-1', isActive: { $ne: false } });
    expect(q.select).toHaveBeenCalledWith(expect.stringContaining('barcode'));
    expect(q.populate).not.toHaveBeenCalled();
    expect(body.data).toEqual([{ _id: 'p1' }]);
    expect(typeof body.syncedAt).toBe('string');
  });

  it('updatedSince filters on updatedAt and includes deactivated products', async () => {
    mocks.find.mockReturnValue(queryReturning([]));

    await get('view=pos&updatedSince=2026-11-01T00:00:00.000Z');

    const query = mocks.find.mock.calls[0][0];
    expect(query.tenantId).toBe('tenant-1');
    expect(query.updatedAt).toEqual({ $gt: new Date('2026-11-01T00:00:00.000Z') });
    expect(query).not.toHaveProperty('isActive');
  });

  it('rejects an invalid updatedSince', async () => {
    const res = (await get('view=pos&updatedSince=not-a-date')) as NextResponse;
    expect(res.status).toBe(400);
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it('count=0 pages with limit+1 and skips countDocuments', async () => {
    const q = queryReturning([{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }]);
    mocks.find.mockReturnValue(q);

    const res = (await get('search=co&page=1&limit=2&count=0')) as NextResponse;
    const body = await res.json();

    expect(q.limit).toHaveBeenCalledWith(3);
    expect(mocks.countDocuments).not.toHaveBeenCalled();
    expect(body.data).toHaveLength(2);
    expect(body.pagination).toEqual({ page: 1, limit: 2, hasMore: true });
  });

  it('paged requests without count=0 still return totals', async () => {
    mocks.find.mockReturnValue(queryReturning([{ _id: 'a' }]));
    mocks.countDocuments.mockResolvedValue(1);

    const res = (await get('page=1&limit=20')) as NextResponse;
    const body = await res.json();

    expect(mocks.countDocuments).toHaveBeenCalled();
    expect(body.pagination.total).toBe(1);
  });
});

describe('searchCatalog', () => {
  const p = (over: Partial<PosProduct>): PosProduct => ({ _id: over.name || 'x', name: 'x', price: 1, stock: 1, ...over });
  const catalog = [
    p({ name: 'Diet Coke 330ml', createdAt: '2026-01-03' }),
    p({ name: 'Coke 1.5L', createdAt: '2026-01-01' }),
    p({ name: 'Cokeless Snack', sku: 'SN-1', createdAt: '2026-01-04' }),
    p({ name: 'Hot Chocolate', description: 'cocoa, not coke', createdAt: '2026-01-05' }),
    p({ name: 'Pinned Cola', sku: 'COKE-PIN', pinned: true, createdAt: '2025-01-01' }),
    p({ name: 'Bread', barcode: '4800016644122' }),
  ];

  it('ranks pinned first, then name prefix, then word start, then other matches', () => {
    expect(searchCatalog(catalog, 'Coke').map((x) => x.name)).toEqual([
      'Pinned Cola',
      'Cokeless Snack', // prefix, newer
      'Coke 1.5L', // prefix, older
      'Diet Coke 330ml', // word start
      'Hot Chocolate', // description match
    ]);
  });

  it('puts exact barcode/SKU hits first and returns nothing for a blank query', () => {
    expect(searchCatalog(catalog, '4800016644122')[0].name).toBe('Bread');
    expect(searchCatalog(catalog, '  ')).toEqual([]);
  });
});
