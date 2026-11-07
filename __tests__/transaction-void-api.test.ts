process.env.JWT_SECRET = 'test-secret-for-void-api-tests-32chars!!';
process.env.MONGODB_URI = 'mongodb://test:test@localhost:27017/localpro-pos-test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: vi.fn().mockResolvedValue('tenant-a'),
  requireTenantAccess: vi.fn().mockResolvedValue({ tenantId: 'tenant-a', user: { userId: 'user-a', role: 'manager' } }),
}));
vi.mock('@/lib/permissions-server', () => ({ hasTenantPermission: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn().mockReturnValue({ allowed: true, retryAfter: 0 }) }));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_key: string, fallback: string) => fallback),
}));

const mockAudit = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/audit', () => ({
  createAuditLog: (...args: unknown[]) => mockAudit(...args),
  AuditActions: { TRANSACTION_CANCEL: 'transaction.cancel' },
}));

const mockPush = vi.fn();
vi.mock('@/lib/ecommerce/inventory-push', () => ({
  pushChannelInventoryForProducts: (...args: unknown[]) => mockPush(...args),
}));

const mockVoidSale = vi.fn();
vi.mock('@/lib/void-sale', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/void-sale')>()),
  voidSale: (...args: unknown[]) => mockVoidSale(...args),
}));

const mockFindOne = vi.fn();
vi.mock('@/models/Transaction', () => ({
  default: { findOne: (...args: unknown[]) => mockFindOne(...args) },
}));

import { PUT } from '@/app/api/transactions/[id]/route';
import { VoidConflictError, VoidVariationUnknownError } from '@/lib/void-sale';

const voidRequest = (body: Record<string, unknown> = { status: 'cancelled', reason: 'Wrong item keyed' }) =>
  PUT(
    new NextRequest('http://localhost/api/transactions/tx-1', { method: 'PUT', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: 'tx-1' }) }
  );

const reversal = { transaction: { _id: 'tx-1', status: 'cancelled' }, productIds: ['p-1'], onAccountReversed: 0, loyaltyPointsReversed: 0, discountReleased: false };

describe('PUT /api/transactions/[id] void', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindOne.mockResolvedValue({ _id: 'tx-1', status: 'completed' });
    mockVoidSale.mockResolvedValue(reversal);
  });

  it('voids a sale for the tenant and logs who, why and what was reversed', async () => {
    const res = await voidRequest();

    expect(res.status).toBe(200);
    expect(mockFindOne.mock.calls[0][0]).toMatchObject({ tenantId: 'tenant-a' });
    expect(mockVoidSale.mock.calls[0][0]).toMatchObject({ tenantId: 'tenant-a', userId: 'user-a', reason: 'Wrong item keyed' });
    expect(mockAudit.mock.calls[0][1].changes).toMatchObject({ reason: 'Wrong item keyed', status: { old: 'completed', new: 'cancelled' } });
    expect(mockPush).toHaveBeenCalledWith('tenant-a', ['p-1'], { stockReason: 'Wrong item keyed' });
  });

  it('requires a reason', async () => {
    const res = await voidRequest({ status: 'cancelled', reason: '   ' });

    expect(res.status).toBe(400);
    expect(mockVoidSale).not.toHaveBeenCalled();
  });

  it('refuses an online store order, which a local void cannot undo', async () => {
    mockFindOne.mockResolvedValue({ _id: 'tx-1', status: 'completed', salesChannel: 'shopify' });

    const res = await voidRequest();

    expect(res.status).toBe(400);
    expect(mockVoidSale).not.toHaveBeenCalled();
  });

  it('refuses a sale that already has a refund, or lost the race to one', async () => {
    mockVoidSale.mockRejectedValue(new VoidConflictError());

    const res = await voidRequest();

    expect(res.status).toBe(409);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it('refuses an older variant sale whose stock has nowhere safe to go', async () => {
    mockVoidSale.mockRejectedValue(new VoidVariationUnknownError());

    const res = await voidRequest();

    expect(res.status).toBe(409);
  });

  it('leaves a sale that is already final alone', async () => {
    mockFindOne.mockResolvedValue({ _id: 'tx-1', status: 'cancelled' });

    const res = await voidRequest();

    expect(res.status).toBe(400);
    expect(mockVoidSale).not.toHaveBeenCalled();
  });
});
