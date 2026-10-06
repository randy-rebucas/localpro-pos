process.env.JWT_SECRET = 'test-secret-for-bookings-api-tests-32chars!!';
Object.assign(process.env, { NODE_ENV: 'test' });

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockBookingFindFirst = vi.fn();
vi.mock('@/lib/db', () => ({
  default: { booking: { findFirst: (...args: unknown[]) => mockBookingFindFirst(...args) } },
  dbTransaction: vi.fn(),
}));

vi.mock('@/lib/notifications', () => ({
  sendBookingConfirmation: vi.fn(),
  sendBookingCancellation: vi.fn(),
  sendBookingReminder: vi.fn(),
}));
vi.mock('@/lib/tenant', () => ({ getTenantSettingsById: vi.fn() }));
vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn(), AuditActions: {} }));
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

const mockHasTenantPermission = vi.fn();
vi.mock('@/lib/permissions-server', () => ({
  hasTenantPermission: (...args: unknown[]) => mockHasTenantPermission(...args),
}));

import { GET } from '@/app/api/bookings/[id]/route';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const TENANT_A = 'tenant-a';

function get() {
  const req = new NextRequest(new URL('/api/bookings/b1', 'http://localhost'));
  return GET(req, { params: Promise.resolve({ id: 'b1' }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue({ userId: 'user-1', tenantId: TENANT_A, email: 'c@x.test', role: 'cashier' });
  mockGetTenantIdForUser.mockResolvedValue(TENANT_A);
});

describe('GET /api/bookings/[id] — permission', () => {
  it('returns 403 without bookings.view and never reads the booking', async () => {
    mockHasTenantPermission.mockResolvedValue(false);
    const res = await get();
    expect(res.status).toBe(403);
    expect(mockHasTenantPermission).toHaveBeenCalledWith('cashier', TENANT_A, 'bookings.view');
    expect(mockBookingFindFirst).not.toHaveBeenCalled();
  });

  it("returns the booking, scoped to the caller's tenant, with bookings.view", async () => {
    mockHasTenantPermission.mockResolvedValue(true);
    mockBookingFindFirst.mockResolvedValue({
      id: 'b1', tenantId: TENANT_A, customerName: 'Ana', serviceName: 'Cut', status: 'pending',
      startTime: new Date('2026-10-06T09:00:00Z'), endTime: new Date('2026-10-06T10:00:00Z'), duration: 60,
      createdAt: new Date(), updatedAt: new Date(), staff: null,
    });
    const res = await get();
    expect(res.status).toBe(200);
    expect(mockBookingFindFirst.mock.calls[0][0].where).toEqual({ id: 'b1', tenantId: TENANT_A });
  });
});
