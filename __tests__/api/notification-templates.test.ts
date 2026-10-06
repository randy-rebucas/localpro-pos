process.env.JWT_SECRET = 'test-secret-for-notif-templates-tests-32chars!';
Object.assign(process.env, { NODE_ENV: 'test' });

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockTenantFindFirst = vi.fn();
const mockSettingsUpsert = vi.fn();
vi.mock('@/lib/db', () => ({
  default: {
    tenant: { findFirst: (...a: unknown[]) => mockTenantFindFirst(...a) },
    tenantSettings: { upsert: (...a: unknown[]) => mockSettingsUpsert(...a) },
  },
}));

vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn(), AuditActions: { UPDATE: 'update' } }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(() => ({ allowed: true })) }));
vi.mock('@/lib/notification-templates', () => ({ validateNotificationTemplate: vi.fn(() => ({ valid: true })) }));

const mockGetCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockHasTenantPermission = vi.fn();
vi.mock('@/lib/permissions-server', () => ({
  hasTenantPermission: (...args: unknown[]) => mockHasTenantPermission(...args),
}));

import { PUT } from '@/app/api/tenants/[slug]/notification-templates/route';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const TENANT_A = 'tenant-a';

function put(body: unknown) {
  const req = new NextRequest(new URL('/api/tenants/store-a/notification-templates', 'http://localhost'), {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return PUT(req, { params: Promise.resolve({ slug: 'store-a' }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue({ userId: 'user-1', tenantId: TENANT_A, role: 'cashier' });
  mockTenantFindFirst.mockResolvedValue({ id: TENANT_A });
  mockSettingsUpsert.mockResolvedValue({ smsBookingReminderTemplate: 'Hi {{customerName}}' });
});

describe('PUT /api/tenants/[slug]/notification-templates — permission', () => {
  it('returns 403 without notifications.manage and writes nothing', async () => {
    mockHasTenantPermission.mockResolvedValue(false);
    const res = await put({ type: 'sms', category: 'bookingReminder', body: 'Hi {{customerName}}' });
    expect(res.status).toBe(403);
    expect(mockHasTenantPermission).toHaveBeenCalledWith('cashier', TENANT_A, 'notifications.manage');
    expect(mockSettingsUpsert).not.toHaveBeenCalled();
  });

  it('saves when a tenant override grants notifications.manage (e.g. to a cashier)', async () => {
    mockHasTenantPermission.mockResolvedValue(true);
    const res = await put({ type: 'sms', category: 'bookingReminder', body: 'Hi {{customerName}}' });
    expect(res.status).toBe(200);
    expect(mockSettingsUpsert.mock.calls[0][0]).toMatchObject({
      where: { tenantId: TENANT_A },
      update: { smsBookingReminderTemplate: 'Hi {{customerName}}' },
    });
  });
});

describe('notifications.manage registry entry', () => {
  it('is registered with a manager floor so the sidebar link and override UI work', async () => {
    const { hasPermission } = await import('@/lib/permissions');
    expect(hasPermission('manager', 'notifications.manage', null)).toBe(true);
    expect(hasPermission('cashier', 'notifications.manage', null)).toBe(false);
  });
});
