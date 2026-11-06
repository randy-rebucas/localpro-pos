process.env.JWT_SECRET = 'test-secret-for-clv-tests-32-characters!!';
process.env.MONGODB_URI = 'mongodb://test:test@localhost:27017/localpro-pos-test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

vi.mock('@/lib/mongodb', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

const mockAggregate = vi.fn();
vi.mock('@/models/Transaction', () => ({
  default: { aggregate: (...args: unknown[]) => mockAggregate(...args) },
}));

const mockBulkWrite = vi.fn();
vi.mock('@/models/Customer', () => ({
  default: { bulkWrite: (...args: unknown[]) => mockBulkWrite(...args) },
}));

vi.mock('@/models/Tenant', () => ({ default: { findById: vi.fn() } }));

const TENANT = 'aaaaaaaaaaaaaaaaaaaaaaaa';
vi.mock('@/lib/tenant-active-query', () => ({
  getActiveTenants: vi.fn().mockResolvedValue([{ _id: { toString: () => 'aaaaaaaaaaaaaaaaaaaaaaaa' }, slug: 'shop', name: 'Shop' }]),
}));

import { calculateCustomerLifetimeValue } from '@/lib/automations/customer-lifetime-value';

describe('calculateCustomerLifetimeValue', () => {
  const customerId = new mongoose.Types.ObjectId();
  const lastPurchase = new Date('2026-01-15');

  beforeEach(() => {
    vi.clearAllMocks();
    mockAggregate.mockReturnValue({
      option: vi.fn().mockResolvedValue([{ _id: customerId, totalSpent: 450, lastPurchase }]),
    });
    mockBulkWrite.mockResolvedValue({});
  });

  it('groups linked sales per customer in one query, scoped to the tenant', async () => {
    const result = await calculateCustomerLifetimeValue();

    expect(mockAggregate).toHaveBeenCalledTimes(1);
    const match = mockAggregate.mock.calls[0][0][0].$match;
    expect(match.tenantId).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(String(match.tenantId)).toBe(TENANT);
    expect(match.customerId).toEqual({ $exists: true, $ne: null });
    expect(match).not.toHaveProperty('$or');
    expect(result.processed).toBe(1);
  });

  it('writes totals with a tenant-scoped filter and leaves notes alone', async () => {
    await calculateCustomerLifetimeValue();

    const { filter, update } = mockBulkWrite.mock.calls[0][0][0].updateOne;
    expect(filter._id).toBe(customerId);
    expect(String(filter.tenantId)).toBe(TENANT);
    expect(update.$set).toEqual({ totalSpent: 450, lastPurchaseDate: lastPurchase });
  });

  it('does not write when updates are turned off', async () => {
    await calculateCustomerLifetimeValue({ updateCustomers: false });

    expect(mockBulkWrite).not.toHaveBeenCalled();
  });
});
