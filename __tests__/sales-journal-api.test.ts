process.env.JWT_SECRET = 'test-secret-for-journal-api-tests-32chars!!';
process.env.MONGODB_URI = 'mongodb://test:test@localhost:27017/localpro-pos-test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/api-tenant', () => ({ getTenantIdFromRequest: vi.fn().mockResolvedValue('tenant-a') }));
vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn().mockResolvedValue({ userId: 'user-a', role: 'manager' }) }));
vi.mock('@/lib/permissions-server', () => ({ hasTenantPermission: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/subscription', () => ({ checkFeatureAccess: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_key: string, fallback: string) => fallback),
}));
vi.mock('@/models/Tenant', () => ({
  default: {
    findById: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }) }),
  },
}));

const mockFind = vi.fn();
vi.mock('@/models/Transaction', () => ({ default: { find: (...args: unknown[]) => mockFind(...args) } }));

import { GET } from '@/app/api/reports/sales-journal/route';

const journal = (query = '') => GET(new NextRequest(new URL(`http://localhost/api/reports/sales-journal${query}`)));

const row = (overrides: Record<string, unknown>) => ({
  createdAt: new Date('2026-11-01T02:00:00Z'),
  paymentMethod: 'cash',
  items: [{ name: 'Item' }],
  ...overrides,
});

const rows = [
  // Fully refunded sale and its refund
  row({ receiptNumber: 'R1', status: 'refunded', subtotal: 100, taxAmount: 12, total: 112 }),
  row({ receiptNumber: 'REF-R1', status: 'refunded', subtotal: 100, taxAmount: 12, total: 112 }),
  // Partly refunded sale and its refund
  row({ receiptNumber: 'R2', status: 'completed', subtotal: 200, discountAmount: 20, taxAmount: 21.6, total: 201.6 }),
  row({ receiptNumber: 'REF-R2', status: 'refunded', subtotal: 100, discountAmount: 10, taxAmount: 10.8, total: 100.8 }),
  // Voided sale
  row({ receiptNumber: 'R3', status: 'cancelled', subtotal: 50, total: 50 }),
];

describe('GET /api/reports/sales-journal', () => {
  beforeEach(() => {
    const query = { select: vi.fn(), sort: vi.fn(), maxTimeMS: vi.fn(), lean: vi.fn().mockResolvedValue(rows) };
    query.select.mockReturnValue(query);
    query.sort.mockReturnValue(query);
    query.maxTimeMS.mockReturnValue(query);
    mockFind.mockReturnValue(query);
  });

  it('keeps sales as recorded and shows refunds as negative lines', async () => {
    const { data } = await (await journal()).json();
    const byReceipt = Object.fromEntries(data.entries.map((e: { receiptNumber: string }) => [e.receiptNumber, e]));

    expect(byReceipt.R1).toMatchObject({ entryType: 'sale', status: 'refunded', total: 112 });
    expect(byReceipt['REF-R1']).toMatchObject({ entryType: 'refund', subtotal: -100, taxAmount: -12, total: -112 });
    expect(byReceipt['REF-R2']).toMatchObject({ discountAmount: -10, taxAmount: -10.8, total: -100.8 });
  });

  it('lists a void at zero', async () => {
    const { data } = await (await journal()).json();

    expect(data.entries.find((e: { receiptNumber: string }) => e.receiptNumber === 'R3')).toMatchObject({
      entryType: 'void',
      subtotal: 0,
      total: 0,
    });
  });

  it('nets the summary, counting sales only', async () => {
    const { data } = await (await journal()).json();

    expect(data.summary).toEqual({
      totalTransactions: 2,
      totalSales: 100.8,
      totalTax: 10.8,
      totalDiscounts: 10,
      totalTaxExempt: 0,
    });
  });

  it('scopes to the tenant and carries the entry type into the CSV', async () => {
    const csv = await (await journal('?format=csv')).text();

    expect(mockFind.mock.calls[0][0].tenantId).toBe('tenant-a');
    expect(csv.split('\n')[0].endsWith('entryType')).toBe(true);
    expect(csv).toContain('-112');
  });
});
