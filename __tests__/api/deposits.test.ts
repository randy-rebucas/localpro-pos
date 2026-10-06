process.env.JWT_SECRET = 'test-secret-for-deposits-api-tests-32chars!!';
Object.assign(process.env, { NODE_ENV: 'test' });

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDepositFindFirst = vi.fn();
const mockDepositUpdateMany = vi.fn();
const mockDepositFindUnique = vi.fn();

vi.mock('@/lib/db', () => ({
  default: {
    deposit: {
      findFirst: (...args: unknown[]) => mockDepositFindFirst(...args),
      updateMany: (...args: unknown[]) => mockDepositUpdateMany(...args),
      findUnique: (...args: unknown[]) => mockDepositFindUnique(...args),
    },
    invoice: { findFirst: vi.fn() },
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 10, resetAfterMs: 0 }),
}));

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditActions: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete' },
}));

vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_key: string, fallback: string) => fallback),
}));

const mockGetCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockGetTenantIdForUser = vi.fn();
vi.mock('@/lib/api-tenant', () => ({
  getTenantIdForUser: (...args: unknown[]) => mockGetTenantIdForUser(...args),
}));

vi.mock('@/lib/permissions-server', () => ({
  hasTenantPermission: vi.fn().mockResolvedValue(true),
}));

import { PATCH } from '@/app/api/deposits/[id]/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT_A = 'tenant-a';

function patch(body: Record<string, unknown>) {
  const req = new NextRequest(new URL('/api/deposits/d1', 'http://localhost'), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return PATCH(req, { params: Promise.resolve({ id: 'd1' }) });
}

async function parseResponse(response: Response) {
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : {} };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue({ userId: 'user-1', tenantId: TENANT_A, email: 'a@x.test', role: 'owner' });
  mockGetTenantIdForUser.mockResolvedValue(TENANT_A);
  // A paid ₱500 deposit; Prisma Decimal arrives as a string-like value.
  mockDepositFindFirst.mockResolvedValue({ id: 'd1', tenantId: TENANT_A, status: 'paid', amount: '500.00', invoiceId: null, paidAt: new Date() });
  mockDepositUpdateMany.mockResolvedValue({ count: 1 });
  mockDepositFindUnique.mockResolvedValue({ id: 'd1', status: 'refunded' });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PATCH /api/deposits/[id] — refund amount', () => {
  it.each([
    ['more than was collected', 500.01],
    ['zero', 0],
    ['negative', -10],
    ['not a number', 'abc'],
  ])('rejects a refund that is %s', async (_label, refundedAmount) => {
    const { status, body } = await parseResponse(await patch({ status: 'refunded', refundedAmount }));
    expect(status).toBe(400);
    expect(body.error).toContain('500.00');
    expect(mockDepositUpdateMany).not.toHaveBeenCalled();
  });

  it('accepts a partial refund', async () => {
    const { status } = await parseResponse(await patch({ status: 'refunded', refundedAmount: 200 }));
    expect(status).toBe(200);
    expect(mockDepositUpdateMany.mock.calls[0][0].data.refundedAmount).toBe(200);
  });

  it('accepts a refund of exactly the deposit amount', async () => {
    const { status } = await parseResponse(await patch({ status: 'refunded', refundedAmount: 500 }));
    expect(status).toBe(200);
  });

  it('refunds the full amount when no amount is given', async () => {
    const { status } = await parseResponse(await patch({ status: 'refunded' }));
    expect(status).toBe(200);
    expect(mockDepositUpdateMany.mock.calls[0][0].data.refundedAmount).toBe('500.00');
  });
});
