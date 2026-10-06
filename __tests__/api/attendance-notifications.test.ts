process.env.JWT_SECRET = 'test-secret-for-attendance-notif-tests-32ch!!';
Object.assign(process.env, { NODE_ENV: 'test' });

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockAttendanceFindMany = vi.fn();
const mockSettingsFindUnique = vi.fn();
vi.mock('@/lib/db', () => ({
  default: {
    attendance: { findMany: (...args: unknown[]) => mockAttendanceFindMany(...args) },
    tenantSettings: { findUnique: (...args: unknown[]) => mockSettingsFindUnique(...args) },
  },
}));

const mockSendAttendanceNotification = vi.fn();
vi.mock('@/lib/notifications', () => ({
  sendAttendanceNotification: (...args: unknown[]) => mockSendAttendanceNotification(...args),
}));

const mockCreateAuditLog = vi.fn();
vi.mock('@/lib/audit', () => ({
  createAuditLog: (...args: unknown[]) => mockCreateAuditLog(...args),
  AuditActions: { ATTENDANCE_NOTIFICATIONS_SEND: 'attendance.notifications_send' },
}));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_key: string, fallback: string) => fallback),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 1, resetAfterMs: 0 })),
}));

const mockRequireAuth = vi.fn();
vi.mock('@/lib/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

const mockGetTenantIdForUser = vi.fn();
vi.mock('@/lib/api-tenant', () => ({
  getTenantIdForUser: (...args: unknown[]) => mockGetTenantIdForUser(...args),
}));

const mockHasTenantPermission = vi.fn();
vi.mock('@/lib/permissions-server', () => ({
  hasTenantPermission: (...args: unknown[]) => mockHasTenantPermission(...args),
}));

import { GET, POST } from '@/app/api/attendance/notifications/route';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_A = 'tenant-a';

// Clocked in 20h ago and never clocked out -> missing_clock_out with default 12h threshold.
const openSession = {
  id: 'att-1',
  userId: 'emp-1',
  clockIn: new Date(Date.now() - 20 * 60 * 60 * 1000),
  clockOut: null,
  user: { id: 'emp-1', name: 'Ana', email: 'ana@store.test' },
};

function post(body: unknown) {
  const req = new NextRequest(new URL('/api/attendance/notifications', 'http://localhost'), {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
  return POST(req);
}

function get() {
  return GET(new NextRequest(new URL('/api/attendance/notifications', 'http://localhost')));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({ userId: 'mgr-1', tenantId: TENANT_A, role: 'manager' });
  mockGetTenantIdForUser.mockResolvedValue(TENANT_A);
  mockHasTenantPermission.mockResolvedValue(true);
  mockSettingsFindUnique.mockResolvedValue(null);
  // First findMany = open sessions, second = today's attendances (none late).
  mockAttendanceFindMany.mockImplementation((args: { where: { clockOut?: null } }) =>
    Promise.resolve('clockOut' in args.where ? [openSession] : [])
  );
  mockSendAttendanceNotification.mockResolvedValue(true);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('attendance notifications permissions', () => {
  it('GET returns 403 without attendance.view', async () => {
    mockHasTenantPermission.mockResolvedValue(false);
    const res = await get();
    expect(res.status).toBe(403);
    expect(mockAttendanceFindMany).not.toHaveBeenCalled();
  });

  it('POST returns 403 without attendance.view and sends nothing', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'c-1', tenantId: TENANT_A, role: 'cashier' });
    mockHasTenantPermission.mockResolvedValue(false);
    const res = await post({ notifications: [{ attendanceId: 'att-1', type: 'missing_clock_out' }] });
    expect(res.status).toBe(403);
    expect(mockSendAttendanceNotification).not.toHaveBeenCalled();
  });

  it('checks the attendance.view permission key', async () => {
    await get();
    expect(mockHasTenantPermission).toHaveBeenCalledWith('manager', TENANT_A, 'attendance.view');
  });
});

describe('attendance notifications POST recipients', () => {
  it('sends to the email from the database, ignoring client-supplied email and message', async () => {
    const res = await post({
      notifications: [
        {
          attendanceId: 'att-1',
          type: 'missing_clock_out',
          userEmail: 'attacker@evil.test',
          userName: 'Spoofed',
          message: 'Click this link',
        },
      ],
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.results.sent).toBe(1);
    expect(mockSendAttendanceNotification).toHaveBeenCalledTimes(1);
    const sent = mockSendAttendanceNotification.mock.calls[0][0];
    expect(sent.userEmail).toBe('ana@store.test');
    expect(sent.userName).toBe('Ana');
    expect(sent.message).not.toBe('Click this link');
  });

  it('sends nothing for attendance IDs that do not match a current notification', async () => {
    const res = await post({
      notifications: [{ attendanceId: 'not-in-this-tenant', type: 'missing_clock_out', userEmail: 'x@evil.test' }],
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.results.total).toBe(0);
    expect(mockSendAttendanceNotification).not.toHaveBeenCalled();
  });

  it('writes an audit log entry for the send', async () => {
    await post({ notifications: [{ attendanceId: 'att-1', type: 'missing_clock_out' }] });
    expect(mockCreateAuditLog).toHaveBeenCalledTimes(1);
    expect(mockCreateAuditLog.mock.calls[0][1]).toMatchObject({
      tenantId: TENANT_A,
      action: 'attendance.notifications_send',
      metadata: { matched: 1, sent: 1 },
    });
  });
});
