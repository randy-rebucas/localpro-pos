process.env.JWT_SECRET = 'test-secret-for-business-hours-tests-32chars!';
Object.assign(process.env, { NODE_ENV: 'test' });

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockTenantFindFirst = vi.fn();
const mockBusinessHourUpsert = vi.fn();
const mockBreakDeleteMany = vi.fn();
const mockBreakCreateMany = vi.fn();
const mockSettingsUpsert = vi.fn();
const mockSpecialDeleteMany = vi.fn();
const mockSpecialCreateMany = vi.fn();

const tx = {
  tenantSettings: { upsert: (...a: unknown[]) => mockSettingsUpsert(...a) },
  tenantBusinessHour: { upsert: (...a: unknown[]) => mockBusinessHourUpsert(...a) },
  tenantBusinessHourBreak: {
    deleteMany: (...a: unknown[]) => mockBreakDeleteMany(...a),
    createMany: (...a: unknown[]) => mockBreakCreateMany(...a),
  },
  tenantSpecialHours: {
    deleteMany: (...a: unknown[]) => mockSpecialDeleteMany(...a),
    createMany: (...a: unknown[]) => mockSpecialCreateMany(...a),
  },
};

vi.mock('@/lib/db', () => ({
  default: { tenant: { findFirst: (...args: unknown[]) => mockTenantFindFirst(...args) } },
  dbTransaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
}));

const mockCreateAuditLog = vi.fn();
vi.mock('@/lib/audit', () => ({
  createAuditLog: (...args: unknown[]) => mockCreateAuditLog(...args),
  AuditActions: { UPDATE: 'update' },
}));

const mockGetCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockHasTenantPermission = vi.fn();
vi.mock('@/lib/permissions-server', () => ({
  hasTenantPermission: (...args: unknown[]) => mockHasTenantPermission(...args),
}));

vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(() => ({ allowed: true })) }));

import { GET, PUT } from '@/app/api/tenants/[slug]/business-hours/route';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const TENANT_A = 'tenant-a';
const params = { params: Promise.resolve({ slug: 'store-a' }) };

const tenantRow = {
  id: TENANT_A,
  settings: { businessHoursTimezone: 'Asia/Manila' },
  businessHours: [
    { id: 'bh1', dayOfWeek: 1, enabled: true, openTime: '09:00', closeTime: '17:00', breaks: [] },
    { id: 'bh0', dayOfWeek: 0, enabled: false, openTime: null, closeTime: null, breaks: [] },
  ],
  specialHours: [],
};

function put(body: unknown) {
  const req = new NextRequest(new URL('/api/tenants/store-a/business-hours', 'http://localhost'), {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return PUT(req, params);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue({ userId: 'user-1', tenantId: TENANT_A, role: 'manager' });
  mockTenantFindFirst.mockResolvedValue(tenantRow);
  mockBusinessHourUpsert.mockImplementation(({ create }: { create: { id: string } }) => Promise.resolve({ id: create.id }));
});

describe('GET /api/tenants/[slug]/business-hours', () => {
  it('keys the schedule by day name, not dayOfWeek', async () => {
    const res = await GET(new NextRequest(new URL('/api/tenants/store-a/business-hours', 'http://localhost')), params);
    const json = await res.json();
    expect(Object.keys(json.data.schedule).sort()).toEqual(['monday', 'sunday']);
    expect(json.data.schedule.monday).toMatchObject({ enabled: true, openTime: '09:00', closeTime: '17:00' });
  });
});

describe('PUT /api/tenants/[slug]/business-hours', () => {
  it('returns 403 without business_hours.manage and writes nothing', async () => {
    mockHasTenantPermission.mockResolvedValue(false);
    const res = await put({ schedule: { monday: { enabled: true } } });
    expect(res.status).toBe(403);
    expect(mockHasTenantPermission).toHaveBeenCalledWith('manager', TENANT_A, 'business_hours.manage');
    expect(mockBusinessHourUpsert).not.toHaveBeenCalled();
  });

  it('persists day-name keys as dayOfWeek (0=Sun) and audits the change', async () => {
    mockHasTenantPermission.mockResolvedValue(true);
    const res = await put({
      schedule: {
        monday: { enabled: true, openTime: '08:00', closeTime: '18:00' },
        sunday: { enabled: false },
        bogus: { enabled: true },
      },
    });
    expect(res.status).toBe(200);
    const days = mockBusinessHourUpsert.mock.calls.map((c) => c[0].where.tenantId_dayOfWeek);
    expect(days).toEqual([
      { tenantId: TENANT_A, dayOfWeek: 1 },
      { tenantId: TENANT_A, dayOfWeek: 0 },
    ]);
    expect(mockCreateAuditLog).toHaveBeenCalledTimes(1);
    expect(mockCreateAuditLog.mock.calls[0][1]).toMatchObject({ tenantId: TENANT_A, action: 'update' });
  });

  it('still accepts numeric dayOfWeek keys', async () => {
    mockHasTenantPermission.mockResolvedValue(true);
    await put({ schedule: { '6': { enabled: true } } });
    expect(mockBusinessHourUpsert.mock.calls[0][0].where.tenantId_dayOfWeek.dayOfWeek).toBe(6);
  });
});
