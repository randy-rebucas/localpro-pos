process.env.JWT_SECRET = 'test-secret-for-void-api-tests-32chars!!';
process.env.MONGODB_URI = 'mongodb://test:test@localhost:27017/localpro-pos-test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: vi.fn().mockResolvedValue('tenant-a'),
  requireTenantAccess: vi.fn().mockResolvedValue({ tenantId: 'tenant-a', user: { userId: 'user-a', role: 'manager' } }),
}));
vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/permissions-server', () => ({ hasTenantPermission: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditActions: { TRANSACTION_CANCEL: 'TRANSACTION_CANCEL' },
}));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_key: string, fallback: string) => fallback),
}));

const mockFindOne = vi.fn();
const mockClaim = vi.fn();
vi.mock('@/models/Transaction', () => ({
  default: {
    findOne: (...args: unknown[]) => mockFindOne(...args),
    findOneAndUpdate: (...args: unknown[]) => mockClaim(...args),
  },
}));

import { PUT } from '@/app/api/transactions/[id]/route';

const voidSale = () =>
  PUT(
    new NextRequest(new URL('http://localhost/api/transactions/tx-1'), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    }),
    { params: Promise.resolve({ id: 'tx-1' }) }
  );

describe('PUT /api/transactions/[id] void', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindOne.mockResolvedValue({ _id: 'tx-1', status: 'completed' });
  });

  it('voids a sale with no refunds, scoped to the tenant', async () => {
    mockClaim.mockResolvedValue({ _id: 'tx-1', status: 'cancelled' });

    const res = await voidSale();

    expect(res.status).toBe(200);
    expect(mockClaim.mock.calls[0][0]).toMatchObject({ tenantId: 'tenant-a', refundCount: { $in: [0, null] } });
  });

  it('refuses a partly refunded sale, which fails the claim', async () => {
    mockClaim.mockResolvedValue(null);

    const res = await voidSale();

    expect(res.status).toBe(409);
  });
});
