process.env.JWT_SECRET = 'test-secret-for-products-barcode-tests-32chars!';
process.env.MONGODB_URI = 'mongodb://test:test@localhost:27017/localpro-pos-test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/api-tenant', () => ({
  requireTenantAccess: vi.fn().mockResolvedValue({ tenantId: 'tenant-a', user: { userId: 'u1', role: 'cashier' } }),
}));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn().mockReturnValue({ allowed: true }) }));

const mockLean = vi.fn();
const mockFindOne = vi.fn();
vi.mock('@/models/Product', () => ({
  default: { findOne: (...args: unknown[]) => mockFindOne(...args) },
}));

import { GET } from '@/app/api/products/by-barcode/route';

const scan = async (code: string) => {
  const res = await GET(new NextRequest(`http://localhost/api/products/by-barcode?code=${encodeURIComponent(code)}`));
  return { status: res.status, body: await res.json() };
};

const shirt = {
  _id: 'p1',
  name: 'Shirt',
  sku: 'SHIRT',
  hasVariations: true,
  variations: [
    { _id: 'v1', size: 'S', sku: 'SHIRT-S', stock: 2 },
    { _id: 'v2', size: 'L', sku: 'SHIRT-L', stock: 0 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFindOne.mockReturnValue({ lean: mockLean });
});

describe('GET /api/products/by-barcode', () => {
  it('returns the product alone when its own code matches', async () => {
    mockLean.mockResolvedValueOnce(shirt);

    const { body } = await scan('SHIRT');

    expect(body.data.product._id).toBe('p1');
    expect(body.data.variation).toBeUndefined();
    expect(mockFindOne).toHaveBeenCalledTimes(1);
  });

  it('finds a variation SKU and says which variation it was', async () => {
    mockLean.mockResolvedValueOnce(null).mockResolvedValueOnce(shirt);

    const { body } = await scan('SHIRT-L');

    expect(body.data.variation._id).toBe('v2');
    expect(mockFindOne.mock.calls[1][0]).toMatchObject({
      tenantId: 'tenant-a',
      hasVariations: true,
      'variations.sku': 'SHIRT-L',
    });
  });

  it('falls back to ignoring case, for variation SKUs too', async () => {
    mockLean.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(shirt);

    const { body } = await scan('shirt-s');

    expect(body.data.variation._id).toBe('v1');
    const fallback = mockFindOne.mock.calls[2][0];
    expect(fallback.tenantId).toBe('tenant-a');
    expect(fallback.$or[2]).toMatchObject({ hasVariations: true });
  });

  it('prefers the product when a variation shares its code', async () => {
    mockLean.mockResolvedValueOnce({ ...shirt, variations: [{ _id: 'v1', size: 'S', sku: 'SHIRT' }] });

    const { body } = await scan('SHIRT');

    expect(body.data.variation).toBeUndefined();
  });

  it('keeps every lookup inside the tenant and to active products', async () => {
    mockLean.mockResolvedValue(null);

    const { status } = await scan('NOPE');

    expect(status).toBe(404);
    expect(mockFindOne).toHaveBeenCalledTimes(3);
    for (const [filter] of mockFindOne.mock.calls) {
      expect(filter).toMatchObject({ tenantId: 'tenant-a', isActive: { $ne: false } });
    }
  });

  it('treats regex characters in a code as plain text', async () => {
    mockLean.mockResolvedValue(null);

    await scan('A.*');

    expect(mockFindOne.mock.calls[2][0].$or[0].barcode.$regex).toBe('^A\\.\\*$');
  });
});
