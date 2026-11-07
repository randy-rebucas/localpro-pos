process.env.JWT_SECRET = 'test-secret-for-cash-cas-tests-32chars!!';
process.env.MONGODB_URI = 'mongodb://test:test@localhost:27017/localpro-pos-test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/api-tenant', () => ({ getTenantIdFromRequest: vi.fn().mockResolvedValue('tenant-a') }));
vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn().mockResolvedValue({ userId: 'user-a', role: 'manager' }) }));
vi.mock('@/lib/permissions-server', () => ({ hasTenantPermission: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/subscription', () => ({ checkBirFeatureAccess: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn().mockResolvedValue(undefined), AuditActions: { UPDATE: 'UPDATE' } }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn().mockReturnValue({ allowed: true }) }));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_key: string, fallback: string) => fallback),
}));
vi.mock('@/models/Tenant', () => ({
  default: {
    findById: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }) }),
  },
}));

const mockTxFind = vi.fn();
vi.mock('@/models/Transaction', () => ({ default: { find: (...args: unknown[]) => mockTxFind(...args) } }));
vi.mock('@/models/Expense', () => ({
  default: { find: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) }) },
}));

const mockSessionFindOne = vi.fn();
const mockSessionClose = vi.fn();
vi.mock('@/models/CashDrawerSession', () => ({
  default: {
    findOne: (...args: unknown[]) => mockSessionFindOne(...args),
    findOneAndUpdate: (...args: unknown[]) => mockSessionClose(...args),
  },
}));

import { POST as drawer } from '@/app/api/cash-drawer/sessions/route';
import { GET as cas } from '@/app/api/reports/cas/route';

const rows = [
  { createdAt: new Date('2026-11-01T02:00:00Z'), receiptNumber: 'R1', status: 'refunded', paymentMethod: 'cash', subtotal: 100, taxAmount: 12, total: 112 },
  { createdAt: new Date('2026-11-01T03:00:00Z'), receiptNumber: 'R2', status: 'completed', paymentMethod: 'cash', subtotal: 200, taxAmount: 24, total: 224 },
  { createdAt: new Date('2026-11-01T04:00:00Z'), receiptNumber: 'REF-R1', status: 'refunded', paymentMethod: 'cash', subtotal: 100, taxAmount: 12, total: 112 },
  { createdAt: new Date('2026-11-01T05:00:00Z'), receiptNumber: 'REF-OLD', status: 'refunded', paymentMethod: 'cash', subtotal: 50, taxAmount: 6, total: 56 },
];

beforeEach(() => {
  vi.clearAllMocks();
  const query = { select: vi.fn(), sort: vi.fn(), maxTimeMS: vi.fn(), lean: vi.fn().mockResolvedValue(rows) };
  query.select.mockReturnValue(query);
  query.sort.mockReturnValue(query);
  query.maxTimeMS.mockReturnValue(query);
  mockTxFind.mockReturnValue(query);
});

describe('closing a cash drawer', () => {
  it('keeps refunded sales and takes each refund out of the drawer', async () => {
    mockSessionFindOne.mockResolvedValue({ _id: 's-1', userId: 'user-a', openingTime: new Date('2026-11-01T00:00:00Z'), openingAmount: 1000 });
    mockSessionClose.mockImplementation(async (_filter, update) => ({ _id: 's-1', ...update.$set }));

    const res = await drawer(new NextRequest(new URL('http://localhost/api/cash-drawer/sessions'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'close', closingAmount: 1168 }),
    }));

    // 1000 + 112 + 224 - 112 - 56
    expect((await res.json()).data).toMatchObject({ expectedAmount: 1168, shortage: 0, overage: 0, totalVAT: 18 });
    expect(mockTxFind.mock.calls[0][0]).toMatchObject({ tenantId: 'tenant-a', userId: 'user-a', status: { $in: ['completed', 'refunded'] } });
  });
});

describe('GET /api/reports/cas', () => {
  it('keeps refunded sales as debits and shows refunds as credits', async () => {
    const res = await cas(new NextRequest(new URL('http://localhost/api/reports/cas')));
    const lines = (await res.text()).split('\n');

    expect(lines.find((l) => l.includes(',R1,'))).toContain('Sales - cash,112,0');
    expect(lines.find((l) => l.includes(',REF-R1,'))).toContain('Refund - cash,0,112,-100,-12,0,-112');
    expect(mockTxFind.mock.calls[0][0]).toMatchObject({ tenantId: 'tenant-a', status: { $in: ['completed', 'refunded'] } });
  });
});
