import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/models/StockMovement', () => ({ default: { create: vi.fn(), insertMany: vi.fn() } }));
vi.mock('@/models/ProductBundle', () => ({ default: { findOne: vi.fn() } }));

const mockUpdate = vi.fn();
vi.mock('@/models/Product', () => ({
  default: { findOneAndUpdate: (...args: unknown[]) => mockUpdate(...args), findOne: vi.fn() },
}));

import { updateBundleStock } from '@/lib/stock';

const bundle = { name: 'Set', trackInventory: true, items: [{ productId: 'prod-a', quantity: 2 }] };
const preloaded = { bundle, products: new Map([['prod-a', { stock: 10, trackInventory: true }]]) } as never;

describe('updateBundleStock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockReturnValue({ lean: vi.fn().mockResolvedValue({ stock: 10 }) });
  });

  it('takes components out of stock on a sale', async () => {
    await updateBundleStock('bundle-a', 'tenant-a', -3, 'sale', { movements: [] }, undefined, preloaded);

    expect(mockUpdate.mock.calls[0][1]).toEqual({ $inc: { stock: -6 } });
  });

  it('puts components back on a return', async () => {
    await updateBundleStock('bundle-a', 'tenant-a', 3, 'return', { movements: [] }, undefined, preloaded);

    expect(mockUpdate.mock.calls[0][1]).toEqual({ $inc: { stock: 6 } });
  });
});
