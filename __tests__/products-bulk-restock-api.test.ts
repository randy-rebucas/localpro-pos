process.env.JWT_SECRET = 'test-secret-for-products-restock-tests-32chars!';
process.env.MONGODB_URI = 'mongodb://test:test@localhost:27017/localpro-pos-test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/api-tenant', () => ({
  requireTenantAccess: vi.fn().mockResolvedValue({ tenantId: 'tenant-a', user: { userId: 'u1', role: 'owner' } }),
}));
vi.mock('@/lib/permissions-server', () => ({ hasTenantPermission: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn(), AuditActions: { UPDATE: 'update' } }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn().mockReturnValue({ allowed: true }) }));

const mockUpdateStock = vi.fn();
vi.mock('@/lib/stock', () => ({
  updateStock: (...args: unknown[]) => mockUpdateStock(...args),
  insertStockMovements: vi.fn().mockResolvedValue(undefined),
  STOCK_SNAPSHOT_FIELDS: 'stock',
}));

const mockLean = vi.fn();
vi.mock('@/models/Product', () => ({
  default: { find: vi.fn(() => ({ select: () => ({ lean: mockLean }) })) },
}));

import { POST } from '@/app/api/products/bulk-restock/route';

const PLAIN = '64b000000000000000000001';
const VARIANT = '64b000000000000000000002';
const EMPTIED = '64b000000000000000000003';

const restock = async (ids: string[]) => {
  const res = await POST(
    new NextRequest('http://localhost/api/products/bulk-restock', {
      method: 'POST',
      body: JSON.stringify({ items: ids.map((productId) => ({ productId, quantity: 5 })) }),
    })
  );
  return res.json();
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateStock.mockResolvedValue(undefined);
  mockLean.mockResolvedValue([
    { _id: PLAIN, stock: 1 },
    { _id: VARIANT, stock: 1, hasVariations: true, variations: [{ _id: 'v1', size: 'S', stock: 2 }] },
    { _id: EMPTIED, stock: 1, hasVariations: true, variations: [] },
  ]);
});

describe('POST /api/products/bulk-restock', () => {
  it('refuses a product with variations and still restocks the rest', async () => {
    const body = await restock([PLAIN, VARIANT]);

    expect(body.restocked).toBe(1);
    expect(body.failed).toBe(1);
    expect(body.errors[0]).toMatchObject({ productId: VARIANT, error: expect.stringContaining('Refill') });
    expect(mockUpdateStock).toHaveBeenCalledTimes(1);
    expect(mockUpdateStock.mock.calls[0][0]).toBe(PLAIN);
  });

  it('restocks a product flagged for variations that has none, since main stock is what sells', async () => {
    const body = await restock([EMPTIED]);

    expect(body.restocked).toBe(1);
    expect(mockUpdateStock).toHaveBeenCalledTimes(1);
  });
});
