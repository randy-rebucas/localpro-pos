import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  class TenantAccessViolationError extends Error {
    tenantSlug = 'other-store';
  }
  return {
    TenantAccessViolationError,
    requireAuth: vi.fn(),
    getTenantId: vi.fn(),
    hasPermission: vi.fn(),
    rateLimit: vi.fn(),
    aggregate: vi.fn(),
    audit: vi.fn(),
    tenantLean: vi.fn(),
  };
});

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/auth', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: mocks.getTenantId,
  TenantAccessViolationError: mocks.TenantAccessViolationError,
  handleTenantAccessViolation: () => Response.json({ success: false, error: 'Forbidden' }, { status: 403 }),
}));
vi.mock('@/lib/permissions-server', () => ({ hasTenantPermission: mocks.hasPermission }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mocks.rateLimit }));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_key: string, fallback: string) => fallback),
}));
vi.mock('@/lib/audit', () => ({ createAuditLog: mocks.audit, AuditActions: { X_READING_VIEW: 'x_reading.view' } }));
vi.mock('@/lib/bir-readings', () => ({
  getDailySalesAggregate: mocks.aggregate,
  startOfBusinessDay: (date: Date | string) => new Date(date),
}));
vi.mock('@/models/Tenant', () => ({
  default: { findById: () => ({ select: () => ({ lean: mocks.tenantLean }) }) },
}));

import { GET } from '@/app/api/reports/x-reading/route';

const request = (query = '') => new NextRequest(`http://localhost/api/reports/x-reading${query}`);

describe('GET /api/reports/x-reading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ userId: 'user-1', tenantId: 'tenant-a', role: 'cashier' });
    mocks.getTenantId.mockResolvedValue('tenant-a');
    mocks.hasPermission.mockResolvedValue(true);
    mocks.rateLimit.mockReturnValue({ allowed: true, remaining: 29, resetAfterMs: 0 });
    mocks.aggregate.mockResolvedValue({ grossSales: 100 });
    mocks.tenantLean.mockResolvedValue({ grandTotalSales: 900, grandTotalTransactionCount: 9 });
  });

  it('returns the reading for the tenant and records the view', async () => {
    const res = await GET(request('?date=2026-11-07'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({ grossSales: 100, currentGrandTotal: 900, currentGrandTotalTransactionCount: 9 });
    expect(mocks.aggregate.mock.calls[0][0]).toBe('tenant-a');
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: 'tenant-a', userId: 'user-1', action: 'x_reading.view' })
    );
  });

  it('reads the named day in Manila time when the store has no timezone set', async () => {
    await GET(request('?date=2026-11-07'));

    expect(mocks.aggregate).toHaveBeenCalledWith('tenant-a', '2026-11-07', 'Asia/Manila');
  });

  it("reads the named day in the store's own timezone when it has one", async () => {
    mocks.tenantLean.mockResolvedValue({ grandTotalSales: 900, settings: { timezone: 'America/New_York' } });

    await GET(request('?date=2026-11-07'));

    expect(mocks.aggregate).toHaveBeenCalledWith('tenant-a', '2026-11-07', 'America/New_York');
  });

  it('uses today when no date is given', async () => {
    const res = await GET(request());

    expect(res.status).toBe(200);
    expect(mocks.aggregate).toHaveBeenCalledOnce();
  });

  it.each(['garbage', '2026-02-31', '2026-13-01', '11/07/2026'])('rejects the date %s without reading sales', async (date) => {
    const res = await GET(request(`?date=${encodeURIComponent(date)}`));

    expect(res.status).toBe(400);
    expect(mocks.aggregate).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('answers 401 when signed out', async () => {
    mocks.requireAuth.mockRejectedValue(new Error('Unauthorized'));

    expect((await GET(request())).status).toBe(401);
  });

  it('answers 403 without the permission', async () => {
    mocks.hasPermission.mockResolvedValue(false);

    const res = await GET(request());

    expect(res.status).toBe(403);
    expect(mocks.hasPermission).toHaveBeenCalledWith('cashier', 'tenant-a', 'reports.x_reading');
    expect(mocks.aggregate).not.toHaveBeenCalled();
  });

  it('answers 403 when the request names another tenant', async () => {
    mocks.getTenantId.mockRejectedValue(new mocks.TenantAccessViolationError('Forbidden'));

    expect((await GET(request())).status).toBe(403);
  });

  it('answers 429 per user once the limit is hit, without writing an audit entry', async () => {
    mocks.rateLimit.mockReturnValue({ allowed: false, remaining: 0, resetAfterMs: 1000 });

    const res = await GET(request());

    expect(res.status).toBe(429);
    expect(mocks.rateLimit.mock.calls[0][0]).toBe('x-reading:tenant-a:user-1');
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
