process.env.JWT_SECRET = 'test-secret-for-holidays-api-tests-32-chars!!';
process.env.MONGODB_URI = 'mongodb://test:test@localhost:27017/localpro-pos-test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn().mockReturnValue({ allowed: true, retryAfter: 0 }) }));
vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue({ _id: 'audit-1' }),
  AuditActions: { UPDATE: 'UPDATE', CREATE: 'CREATE', DELETE: 'DELETE' },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const mockGetCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({ getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args) }));

const mockHasTenantPermission = vi.fn();
vi.mock('@/lib/permissions-server', () => ({
  hasTenantPermission: (...args: unknown[]) => mockHasTenantPermission(...args),
}));

const mockFindOne = vi.fn();
const mockUpdateOne = vi.fn();
vi.mock('@/models/Tenant', () => ({
  default: {
    findOne: (...args: unknown[]) => mockFindOne(...args),
    updateOne: (...args: unknown[]) => mockUpdateOne(...args),
  },
}));

import { PUT } from '@/app/api/tenants/[slug]/holidays/route';

const TENANT_ID = 'tenant-a-id';

/** Mimics a hydrated Mongoose subdocument: own internal keys that point at the parent. */
function hydratedHoliday(parent: Record<string, unknown>) {
  const plain = { id: 'h1', name: 'Old', date: '2026-12-25', type: 'single', isBusinessClosed: true, createdAt: '2026-01-01' };
  return { ...plain, $__parent: parent, _doc: parent, toObject: () => ({ ...plain }) };
}

describe('PUT /api/tenants/:slug/holidays', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue({ userId: 'u1', tenantId: TENANT_ID, role: 'manager' });
    mockUpdateOne.mockResolvedValue({ matchedCount: 1 });
    mockHasTenantPermission.mockResolvedValue(true);
  });

  it('honours a role override that revokes holidays.manage', async () => {
    mockHasTenantPermission.mockResolvedValue(false);
    const req = new NextRequest(new URL('/api/tenants/store-a/holidays', 'http://localhost'), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'h1', name: 'X' }),
    });
    const res = await PUT(req, { params: Promise.resolve({ slug: 'store-a' }) });

    expect(res.status).toBe(403);
    expect(mockHasTenantPermission).toHaveBeenCalledWith('manager', TENANT_ID, 'holidays.manage');
    expect(mockFindOne).not.toHaveBeenCalled();
  });

  it('returns only the holiday, never the parent tenant document', async () => {
    const parent = { notes: 'super-admin only', settings: { multiCurrency: { exchangeRateApiKey: 'sk-live' } } };
    mockFindOne.mockResolvedValue({
      _id: { toString: () => TENANT_ID },
      settings: { holidays: [hydratedHoliday(parent)] },
    });

    const req = new NextRequest(new URL('/api/tenants/store-a/holidays', 'http://localhost'), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'h1', name: 'Christmas', createdAt: '1999-01-01', _id: 'x' }),
    });
    const res = await PUT(req, { params: Promise.resolve({ slug: 'store-a' }) });
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(text).not.toContain('sk-live');
    expect(text).not.toContain('super-admin only');
    const body = JSON.parse(text);
    expect(body.data).toEqual({ id: 'h1', name: 'Christmas', date: '2026-12-25', type: 'single', isBusinessClosed: true, createdAt: '2026-01-01' });
    expect(mockUpdateOne.mock.calls[0][1]).toEqual({ $set: { 'settings.holidays.$': body.data } });
  });
});
