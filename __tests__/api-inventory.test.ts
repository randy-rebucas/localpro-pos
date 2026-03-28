/**
 * Section 8 — Inventory & Stock
 * Tests: 8.1 – 8.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue(
    (_key: string, fallback: string) => fallback
  ),
}));

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn().mockResolvedValue({ userId: 'user1', tenantId: 'tenant123', role: 'admin' }),
}));
vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: vi.fn().mockResolvedValue('tenant123'),
}));
// @/lib/stock is NOT globally mocked — use vi.spyOn per-test for route tests;
// the real updateStock runs in lib unit tests (8.4–8.6) with mocked DB models.

vi.mock('@/models/Tenant', () => ({
  default: { findById: vi.fn() },
}));
vi.mock('@/models/Product', () => ({
  default: {
    findOne: vi.fn(),
    find: vi.fn(),
  },
}));
vi.mock('@/models/StockMovement', () => ({
  default: {
    find: vi.fn(),
    create: vi.fn(),
    countDocuments: vi.fn(),
  },
}));

// ── Imports after mocks ────────────────────────────────────────────────────
import { requireAuth } from '@/lib/auth';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import * as stockLib from '@/lib/stock';
import { updateStock } from '@/lib/stock';
import Tenant from '@/models/Tenant';
import Product from '@/models/Product';
import StockMovement from '@/models/StockMovement';

// ── Fixtures ───────────────────────────────────────────────────────────────
const TENANT_ID = 'tenant123';
const PRODUCT_ID = 'prod_abc';

const mockLowStockProduct = {
  _id: PRODUCT_ID,
  tenantId: TENANT_ID,
  name: 'Widget',
  sku: 'WGT-001',
  stock: 3,
  currentStock: 3,
  threshold: 10,
  trackInventory: true,
};

const mockMovement = {
  _id: 'mov_abc',
  tenantId: TENANT_ID,
  productId: PRODUCT_ID,
  type: 'sale',
  quantity: -2,
  previousStock: 10,
  newStock: 8,
};

const makeProductDoc = (overrides: Record<string, unknown> = {}) => ({
  _id: PRODUCT_ID,
  tenantId: TENANT_ID,
  name: 'Widget',
  stock: 10,
  trackInventory: true,
  allowOutOfStockSales: false,
  hasVariations: false,
  ...overrides,
  save: vi.fn().mockResolvedValue(undefined),
  isModified: vi.fn().mockReturnValue(false),
  markModified: vi.fn(),
});

const req = (method: string, url: string, token = 'Bearer tok') =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { Authorization: token },
  });

// ── 8.1  GET /api/inventory/low-stock ─────────────────────────────────────
describe('GET /api/inventory/low-stock (8.1)', () => {
  let getLowStockSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(Tenant.findById).mockResolvedValue({
      settings: { lowStockThreshold: 10 },
    } as any);
    getLowStockSpy = vi.spyOn(stockLib, 'getLowStockProducts').mockResolvedValue([mockLowStockProduct]);
  });

  it('returns products below stock threshold', async () => {
    const { GET } = await import('@/app/api/inventory/low-stock/route');
    const res = await GET(req('GET', '/api/inventory/low-stock'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.count).toBe(1);
    expect(body.threshold).toBe(10);
  });

  it('uses tenant default threshold when none specified', async () => {
    const { GET } = await import('@/app/api/inventory/low-stock/route');
    await GET(req('GET', '/api/inventory/low-stock'));
    expect(getLowStockSpy).toHaveBeenCalledWith(TENANT_ID, undefined, 10);
  });

  it('respects custom threshold query param', async () => {
    const { GET } = await import('@/app/api/inventory/low-stock/route');
    await GET(req('GET', '/api/inventory/low-stock?threshold=5'));
    expect(getLowStockSpy).toHaveBeenCalledWith(TENANT_ID, undefined, 5);
  });

  it('passes branchId filter', async () => {
    const { GET } = await import('@/app/api/inventory/low-stock/route');
    await GET(req('GET', '/api/inventory/low-stock?branchId=branch1'));
    expect(getLowStockSpy).toHaveBeenCalledWith(TENANT_ID, 'branch1', 10);
  });

  it('returns 404 when no tenantId', async () => {
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(null);
    const { GET } = await import('@/app/api/inventory/low-stock/route');
    const res = await GET(req('GET', '/api/inventory/low-stock', ''));
    expect(res.status).toBe(404);
  });

  it('returns 500 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'));
    const { GET } = await import('@/app/api/inventory/low-stock/route');
    const res = await GET(req('GET', '/api/inventory/low-stock', ''));
    expect(res.status).toBe(500);
  });
});

// ── 8.2  GET /api/inventory/realtime ──────────────────────────────────────
describe('GET /api/inventory/realtime (8.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
  });

  it('returns SSE stream with correct content-type', async () => {
    const { GET } = await import('@/app/api/inventory/realtime/route');
    const res = await GET(req('GET', '/api/inventory/realtime'));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('cache-control')).toBe('no-cache');
  });

  it('returns 404 when no tenantId', async () => {
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(null);
    const { GET } = await import('@/app/api/inventory/realtime/route');
    const res = await GET(req('GET', '/api/inventory/realtime', ''));
    expect(res.status).toBe(404);
  });

  it('returns 500 when auth throws', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'));
    const { GET } = await import('@/app/api/inventory/realtime/route');
    const res = await GET(req('GET', '/api/inventory/realtime', ''));
    expect(res.status).toBe(500);
  });
});

// ── 8.3  GET /api/stock-movements ─────────────────────────────────────────
describe('GET /api/stock-movements (8.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(StockMovement.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          skip: vi.fn().mockReturnValue({
            populate: vi.fn().mockReturnValue({
              populate: vi.fn().mockReturnValue({
                populate: vi.fn().mockReturnValue({
                  lean: vi.fn().mockResolvedValue([mockMovement]),
                }),
              }),
            }),
          }),
        }),
      }),
    } as any);
    vi.mocked(StockMovement.countDocuments).mockResolvedValue(1 as any);
  });

  it('returns stock movements with pagination', async () => {
    const { GET } = await import('@/app/api/stock-movements/route');
    const res = await GET(req('GET', '/api/stock-movements'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.pagination).toMatchObject({ total: 1, page: 1 });
  });

  it('filters by productId', async () => {
    const { GET } = await import('@/app/api/stock-movements/route');
    await GET(req('GET', `/api/stock-movements?productId=${PRODUCT_ID}`));
    expect(vi.mocked(StockMovement.find)).toHaveBeenCalledWith(
      expect.objectContaining({ productId: PRODUCT_ID })
    );
  });

  it('filters by movement type', async () => {
    const { GET } = await import('@/app/api/stock-movements/route');
    await GET(req('GET', '/api/stock-movements?type=sale'));
    expect(vi.mocked(StockMovement.find)).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sale' })
    );
  });

  it('returns 404 when no tenantId', async () => {
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(null);
    const { GET } = await import('@/app/api/stock-movements/route');
    const res = await GET(req('GET', '/api/stock-movements', ''));
    expect(res.status).toBe(404);
  });
});

// ── 8.4 / 8.5 / 8.6  updateStock lib unit tests ───────────────────────────
// These test the real updateStock function (not mocked) against mocked DB models.
// updateStock does: Product.findOne → mutate product.stock → product.save → StockMovement.create

const mockFindOne = (productDoc: ReturnType<typeof makeProductDoc>) => {
  // updateStock calls: const query = Product.findOne(...); if (session) query.session(session); const product = await query;
  // No session passed in unit tests, so we just need a thenable that resolves to the doc.
  vi.mocked(Product.findOne).mockResolvedValue(productDoc as any);
};

describe('updateStock — sale decrements stock (8.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(StockMovement.create).mockResolvedValue(undefined as any);
  });

  it('decrements product stock on sale and logs movement', async () => {
    const productDoc = makeProductDoc({ stock: 10 });
    mockFindOne(productDoc);

    await updateStock(PRODUCT_ID, TENANT_ID, -2, 'sale');

    expect(productDoc.stock).toBe(8);
    expect(productDoc.save).toHaveBeenCalled();
    expect(vi.mocked(StockMovement.create)).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sale', quantity: -2, previousStock: 10, newStock: 8 })
    );
  });
});

describe('updateStock — refund increments stock (8.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(StockMovement.create).mockResolvedValue(undefined as any);
  });

  it('increments product stock on return', async () => {
    const productDoc = makeProductDoc({ stock: 8 });
    mockFindOne(productDoc);

    await updateStock(PRODUCT_ID, TENANT_ID, 2, 'return');

    expect(productDoc.stock).toBe(10);
    expect(productDoc.save).toHaveBeenCalled();
    expect(vi.mocked(StockMovement.create)).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'return', quantity: 2, previousStock: 8, newStock: 10 })
    );
  });
});

describe('updateStock — refill increments stock (8.6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(StockMovement.create).mockResolvedValue(undefined as any);
  });

  it('increments product stock on purchase/refill', async () => {
    const productDoc = makeProductDoc({ stock: 5 });
    mockFindOne(productDoc);

    await updateStock(PRODUCT_ID, TENANT_ID, 50, 'purchase');

    expect(productDoc.stock).toBe(55);
    expect(productDoc.save).toHaveBeenCalled();
    expect(vi.mocked(StockMovement.create)).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'purchase', quantity: 50, previousStock: 5, newStock: 55 })
    );
  });

  it('skips stock update when trackInventory is false', async () => {
    const productDoc = makeProductDoc({ stock: 5, trackInventory: false });
    mockFindOne(productDoc);

    await updateStock(PRODUCT_ID, TENANT_ID, 50, 'purchase');

    expect(productDoc.save).not.toHaveBeenCalled();
    expect(vi.mocked(StockMovement.create)).not.toHaveBeenCalled();
  });

  it('throws when insufficient stock and allowOutOfStockSales is false', async () => {
    const productDoc = makeProductDoc({ stock: 3, allowOutOfStockSales: false });
    mockFindOne(productDoc);

    await expect(updateStock(PRODUCT_ID, TENANT_ID, -10, 'sale')).rejects.toThrow(
      /insufficient stock/i
    );
  });
});
