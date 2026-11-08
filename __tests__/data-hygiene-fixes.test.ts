(process.env as Record<string, string>).JWT_SECRET = 'test-secret-for-data-hygiene-fixes-tests-32chars!!';
(process.env as Record<string, string>).NODE_ENV = 'test';
(process.env as Record<string, string>).MONGODB_URI = 'mongodb://test:test@localhost:27017/localpro-pos-test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 1, resetAfterMs: 0 }) }));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_key: string, fallback: string) => fallback),
}));
vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn().mockResolvedValue(undefined), AuditActions: { DISCOUNT_UPDATE: 'u', DISCOUNT_DELETE: 'd', DELETE: 'd' } }));
vi.mock('@/lib/permissions-server', () => ({ hasTenantPermission: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/api-tenant', () => ({
  requireTenantAccess: vi.fn().mockResolvedValue({ tenantId: '507f1f77bcf86cd799439011', user: { userId: 'u1', role: 'manager' } }),
}));
const mockDiscountFindOne = vi.fn();
vi.mock('@/models/Discount', () => ({ default: { findOne: (...a: unknown[]) => mockDiscountFindOne(...a) } }));
vi.mock('@/models/Tenant', () => ({ default: { findById: () => ({ select: () => ({ lean: () => Promise.resolve(null) }) }) } }));

import { csvCell, arrayToCSV } from '@/lib/export';
import { parseCSV } from '@/lib/product-import';
import { sanitizeString } from '@/lib/validation';
import { expenseDateFromInput, expenseDayString } from '@/lib/expense-date';
import { PUT as putDiscount, DELETE as deleteDiscount } from '@/app/api/discounts/[id]/route';

const json = (url: string, method: string, body?: unknown) =>
  new NextRequest(url, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json' } });

describe('csvCell', () => {
  it('neutralises text a spreadsheet would run as a formula', () => {
    expect(csvCell('=HYPERLINK("http://x","Click")')).toBe('"\'=HYPERLINK(""http://x"",""Click"")"');
    expect(csvCell('+1+1')).toBe("'+1+1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('-2+3')).toBe("'-2+3");
  });

  it('leaves numbers and plain numeric strings alone', () => {
    expect(csvCell(-500)).toBe('-500');
    expect(csvCell('-500')).toBe('-500');
    expect(csvCell('12.50')).toBe('12.50');
    expect(csvCell(null)).toBe('');
  });

  it('round-trips through the product import parser', () => {
    const csv = arrayToCSV([{ name: '=cmd', sku: 'A,1' }], ['name', 'sku']);
    expect(parseCSV(csv)[1]).toEqual(['=cmd', 'A,1']);
  });
});

describe('sanitizeString', () => {
  it('keeps & as typed (React escapes on output)', () => {
    expect(sanitizeString('Salt & Pepper')).toBe('Salt & Pepper');
    expect(sanitizeString('<b>x</b>')).toBe('bx/b');
  });
});

describe('expenseDateFromInput', () => {
  it('stores a picked day as midday at the store, inside that day in any zone', () => {
    const manila = expenseDateFromInput('2026-11-08', 'Asia/Manila')!;
    expect(manila.toISOString()).toBe('2026-11-08T04:00:00.000Z');
    expect(expenseDayString(manila, 'Asia/Manila')).toBe('2026-11-08');

    const ny = expenseDateFromInput('2026-11-08', 'America/New_York')!;
    expect(expenseDayString(ny, 'America/New_York')).toBe('2026-11-08');
    expect(ny.toISOString().slice(0, 10)).toBe('2026-11-08');
  });

  it('rejects junk and keeps full timestamps', () => {
    expect(expenseDateFromInput('not a date')).toBeNull();
    expect(expenseDateFromInput('2026-11-08T09:30:00.000Z')!.toISOString()).toBe('2026-11-08T09:30:00.000Z');
  });
});

describe('statutory discounts (SC20 / PWD20)', () => {
  const params = { params: Promise.resolve({ id: 'd1' }) };
  beforeEach(() => vi.clearAllMocks());

  const sc20 = (extra: Record<string, unknown> = {}) => ({
    code: 'SC20', type: 'percentage', value: 20, category: 'senior', isActive: true, requiresIdVerification: true,
    usageCount: 0, save: vi.fn().mockResolvedValue(undefined), deleteOne: vi.fn(), ...extra,
  });

  it('refuses lowering the rate', async () => {
    const discount = sc20();
    mockDiscountFindOne.mockResolvedValue(discount);
    const res = await putDiscount(json('http://x/api/discounts/d1', 'PUT', { value: 5 }), params);
    expect(res.status).toBe(400);
    expect(discount.save).not.toHaveBeenCalled();
  });

  it('allows renaming, and switching it back on', async () => {
    const discount = sc20({ isActive: false });
    mockDiscountFindOne.mockResolvedValue(discount);
    const res = await putDiscount(json('http://x/api/discounts/d1', 'PUT', { name: 'Senior 20%', isActive: true }), params);
    expect(res.status).toBe(200);
    expect(discount).toMatchObject({ name: 'Senior 20%', isActive: true });
  });

  it('refuses deleting it', async () => {
    const discount = sc20();
    mockDiscountFindOne.mockResolvedValue(discount);
    const res = await deleteDiscount(new NextRequest('http://x/api/discounts/d1', { method: 'DELETE' }), params);
    expect(res.status).toBe(400);
    expect(discount.deleteOne).not.toHaveBeenCalled();
  });
});
