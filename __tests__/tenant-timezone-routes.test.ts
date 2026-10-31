/**
 * Tenant-timezone day boundaries in API routes.
 *
 * Production runs on Vercel where the process clock is UTC, but tenants operate
 * in settings.timezone (default Asia/Manila, UTC+8). These tests pin the process
 * to UTC and use 'Z' system times to prove "today", date-range params and
 * booking slot times are computed in Manila time, not server-local time.
 */
process.env.TZ = 'UTC';
process.env.JWT_SECRET = 'test-secret-for-tz-route-tests-32-chars!!';
process.env.MONGODB_URI = 'mongodb://test:test@localhost:27017/localpro-pos-test';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_k: string, fallback: string) => fallback),
}));
vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue({ _id: 'audit-1' }),
  AuditActions: { CLOCK_IN: 'CLOCK_IN', CLOCK_OUT: 'CLOCK_OUT' },
}));
vi.mock('@/lib/notifications', () => ({
  sendEmail: vi.fn(),
  sendAttendanceNotification: vi.fn(),
}));
vi.mock('@/lib/booking-scheduling-access', () => ({
  requireBookingSchedulingAccess: vi.fn().mockResolvedValue(undefined),
}));

const mockGetTenantSettingsById = vi.fn();
vi.mock('@/lib/tenant', () => ({
  getTenantSettingsById: (...args: unknown[]) => mockGetTenantSettingsById(...args),
}));

const mockRequireAuth = vi.fn();
const mockGetCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

const mockRequireTenantAccess = vi.fn();
const mockGetTenantIdFromRequest = vi.fn();
vi.mock('@/lib/api-tenant', () => ({
  requireTenantAccess: (...args: unknown[]) => mockRequireTenantAccess(...args),
  getTenantIdFromRequest: (...args: unknown[]) => mockGetTenantIdFromRequest(...args),
  TenantAccessViolationError: class TenantAccessViolationError extends Error {},
  handleTenantAccessViolation: vi.fn(),
}));

vi.mock('@/lib/permissions-server', () => ({
  hasTenantPermission: vi.fn().mockResolvedValue(true),
}));

const mockTransactionAggregate = vi.fn();
const mockTransactionFind = vi.fn();
vi.mock('@/models/Transaction', () => ({
  default: {
    aggregate: (...args: unknown[]) => mockTransactionAggregate(...args),
    find: (...args: unknown[]) => mockTransactionFind(...args),
  },
}));
const mockExpenseAggregate = vi.fn();
vi.mock('@/models/Expense', () => ({
  default: { aggregate: (...args: unknown[]) => mockExpenseAggregate(...args) },
}));

const mockAttendanceFind = vi.fn();
vi.mock('@/models/Attendance', () => ({
  default: { find: (...args: unknown[]) => mockAttendanceFind(...args) },
}));
vi.mock('@/models/User', () => ({ default: {} }));

const mockTenantFindById = vi.fn();
const mockTenantFindOne = vi.fn();
vi.mock('@/models/Tenant', () => ({
  default: {
    findById: (...args: unknown[]) => mockTenantFindById(...args),
    findOne: (...args: unknown[]) => mockTenantFindOne(...args),
  },
}));

const mockBookingFind = vi.fn();
vi.mock('@/models/Booking', () => ({
  default: { find: (...args: unknown[]) => mockBookingFind(...args) },
}));
const mockProductFindOne = vi.fn();
vi.mock('@/models/Product', () => ({
  default: { findOne: (...args: unknown[]) => mockProductFindOne(...args) },
}));

import { GET as statsGET } from '@/app/api/transactions/stats/route';
import { GET as attendanceGET } from '@/app/api/attendance/route';
import { GET as notificationsGET } from '@/app/api/attendance/notifications/route';
import { GET as timeSlotsGET } from '@/app/api/bookings/time-slots/route';
import { GET as availabilityGET } from '@/app/api/booking/availability/route';
import { getSalesReport } from '@/lib/analytics';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT_ID = '64b7f0c2a1b2c3d4e5f60718';

function req(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost'));
}

/** A Mongoose-style query chain whose terminal .lean() resolves to `result`. */
function chain(result: unknown) {
  const q: Record<string, unknown> = {};
  q.populate = vi.fn().mockReturnValue(q);
  q.sort = vi.fn().mockReturnValue(q);
  q.limit = vi.fn().mockReturnValue(q);
  q.select = vi.fn().mockReturnValue(q);
  q.lean = vi.fn().mockResolvedValue(result);
  return q;
}

it('runs with a UTC process clock (like Vercel)', () => {
  expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(0);
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  mockGetTenantSettingsById.mockResolvedValue({ timezone: 'Asia/Manila' });
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// transactions/stats
// ---------------------------------------------------------------------------

describe('GET /api/transactions/stats — tenant-local "today"', () => {
  beforeEach(() => {
    mockRequireTenantAccess.mockResolvedValue({ tenantId: TENANT_ID, user: { role: 'owner' } });
    mockTransactionAggregate.mockResolvedValue([{ stats: [], paymentMethodStats: [], timeSeriesData: [] }]);
    mockExpenseAggregate.mockResolvedValue([]);
  });

  it('starts "today" at Manila midnight, even when the UTC date is still yesterday', async () => {
    // 04:00 Oct 31 in Manila = 20:00 Oct 30 UTC. Server-local (UTC) midnight would be Oct 30 00:00Z.
    vi.setSystemTime(new Date('2026-10-30T20:00:00Z'));

    const res = await statsGET(req('/api/transactions/stats?period=today'));
    expect(res.status).toBe(200);

    const pipeline = mockTransactionAggregate.mock.calls[0][0];
    const match = pipeline[0].$match;
    expect(match.createdAt.$gte.toISOString()).toBe('2026-10-30T16:00:00.000Z');
    expect(match.createdAt.$lte.toISOString()).toBe('2026-10-30T20:00:00.000Z');

    // Hourly chart buckets are Manila hours
    const timeSeries = pipeline[1].$facet.timeSeriesData[0].$group._id;
    expect(timeSeries).toEqual({ $hour: { date: '$createdAt', timezone: 'Asia/Manila' } });

    // Expenses use the same window
    const expenseMatch = mockExpenseAggregate.mock.calls[0][0][0].$match;
    expect(expenseMatch.date.$gte.toISOString()).toBe('2026-10-30T16:00:00.000Z');
  });

  it('uses Manila midnight later in the Manila day too', async () => {
    vi.setSystemTime(new Date('2026-10-31T09:00:00Z')); // 17:00 Manila Oct 31
    await statsGET(req('/api/transactions/stats?period=today'));
    const match = mockTransactionAggregate.mock.calls[0][0][0].$match;
    expect(match.createdAt.$gte.toISOString()).toBe('2026-10-30T16:00:00.000Z');
  });

  it('honours a non-Manila tenant timezone', async () => {
    mockGetTenantSettingsById.mockResolvedValue({ timezone: 'America/New_York' });
    vi.setSystemTime(new Date('2026-10-31T09:00:00Z')); // 05:00 EDT Oct 31
    await statsGET(req('/api/transactions/stats?period=today'));
    const match = mockTransactionAggregate.mock.calls[0][0][0].$match;
    expect(match.createdAt.$gte.toISOString()).toBe('2026-10-31T04:00:00.000Z');
  });

  it('groups daily buckets by Manila calendar day for week/month', async () => {
    vi.setSystemTime(new Date('2026-10-31T09:00:00Z'));
    await statsGET(req('/api/transactions/stats?period=week'));
    const group = mockTransactionAggregate.mock.calls[0][0][1].$facet.timeSeriesData[0].$group._id;
    expect(group).toEqual({
      year: { $year: { date: '$createdAt', timezone: 'Asia/Manila' } },
      month: { $month: { date: '$createdAt', timezone: 'Asia/Manila' } },
      day: { $dayOfMonth: { date: '$createdAt', timezone: 'Asia/Manila' } },
    });
  });
});

// ---------------------------------------------------------------------------
// attendance
// ---------------------------------------------------------------------------

describe('GET /api/attendance — date range in tenant timezone', () => {
  it('maps startDate/endDate YYYY-MM-DD to Manila day boundaries', async () => {
    vi.setSystemTime(new Date('2026-10-31T09:00:00Z'));
    mockRequireAuth.mockResolvedValue({ userId: 'u1', tenantId: TENANT_ID, role: 'owner' });
    mockAttendanceFind.mockReturnValue(chain([]));

    const res = await attendanceGET(req('/api/attendance?startDate=2026-10-31&endDate=2026-10-31'));
    expect(res.status).toBe(200);

    const query = mockAttendanceFind.mock.calls[0][0];
    expect(query.tenantId).toBe(TENANT_ID);
    expect(query.clockIn.$gte.toISOString()).toBe('2026-10-30T16:00:00.000Z');
    expect(query.clockIn.$lte.toISOString()).toBe('2026-10-31T15:59:59.999Z');
  });
});

describe('GET /api/attendance/notifications — "today" and late arrivals in tenant timezone', () => {
  beforeEach(() => {
    mockRequireAuth.mockResolvedValue({ userId: 'u1', tenantId: TENANT_ID, role: 'owner' });
    mockGetTenantIdFromRequest.mockResolvedValue(TENANT_ID);
    mockTenantFindById.mockReturnValue(chain({ settings: { timezone: 'Asia/Manila' } }));
  });

  it('queries Manila "today" and measures lateness against 09:00 Manila', async () => {
    // 09:40 Manila Oct 31 = 01:40Z
    vi.setSystemTime(new Date('2026-10-31T01:40:00Z'));
    const clockIn = new Date('2026-10-31T01:30:00Z'); // 09:30 Manila → 30 min late
    mockAttendanceFind
      .mockReturnValueOnce(chain([])) // active sessions
      .mockReturnValueOnce(chain([{ _id: 'a1', userId: { _id: 'u2', name: 'Ana', email: null }, clockIn }]));

    const res = await notificationsGET(req('/api/attendance/notifications?expectedStartTime=09:00'));
    const body = await res.json();
    expect(res.status).toBe(200);

    const todayQuery = mockAttendanceFind.mock.calls[1][0];
    expect(todayQuery.clockIn.$gte.toISOString()).toBe('2026-10-30T16:00:00.000Z');
    expect(todayQuery.clockIn.$lte.toISOString()).toBe('2026-10-31T15:59:59.999Z');

    const late = body.data.notifications.filter((n: { type: string }) => n.type === 'late_arrival');
    expect(late).toHaveLength(1);
    expect(late[0].minutesLate).toBe(30);
    expect(new Date(late[0].expectedTime).toISOString()).toBe('2026-10-31T01:00:00.000Z');
  });

  it('does not flag an on-time 08:55 Manila clock-in (UTC hour 00) as late', async () => {
    vi.setSystemTime(new Date('2026-10-31T01:40:00Z'));
    mockAttendanceFind
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([{ _id: 'a1', userId: 'u2', clockIn: new Date('2026-10-31T00:55:00Z') }]));

    const res = await notificationsGET(req('/api/attendance/notifications?expectedStartTime=09:00'));
    const body = await res.json();
    expect(body.data.summary.lateArrivals).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// bookings/time-slots
// ---------------------------------------------------------------------------

describe('GET /api/bookings/time-slots — slots are Manila wall-clock times', () => {
  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue({ userId: 'u1', tenantId: TENANT_ID, role: 'owner' });
    mockGetTenantIdFromRequest.mockResolvedValue(TENANT_ID);
  });

  it('generates 09:00–11:00 Manila slots as the correct UTC instants', async () => {
    vi.setSystemTime(new Date('2026-10-30T20:00:00Z'));
    mockBookingFind.mockReturnValue(chain([
      // 10:00–11:00 Manila booking
      { _id: 'b1', startTime: new Date('2026-10-31T02:00:00Z'), endTime: new Date('2026-10-31T03:00:00Z') },
    ]));

    const res = await timeSlotsGET(
      req('/api/bookings/time-slots?date=2026-10-31&startHour=9&endHour=11&slotInterval=60&duration=60')
    );
    const body = await res.json();
    expect(res.status).toBe(200);

    const query = mockBookingFind.mock.calls[0][0];
    expect(query.tenantId).toBe(TENANT_ID);
    expect(query.startTime.$gte.toISOString()).toBe('2026-10-30T16:00:00.000Z');
    expect(query.startTime.$lte.toISOString()).toBe('2026-10-31T15:59:59.999Z');

    expect(body.data.date).toBe('2026-10-30T16:00:00.000Z');
    expect(body.data.slots).toEqual([
      { time: '2026-10-31T01:00:00.000Z', available: true },
      { time: '2026-10-31T02:00:00.000Z', available: false, bookingId: 'b1' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// booking/availability (public)
// ---------------------------------------------------------------------------

describe('GET /api/booking/availability — slots and "past" in tenant timezone', () => {
  beforeEach(() => {
    mockTenantFindOne.mockReturnValue(chain({ _id: TENANT_ID, settings: { timezone: 'Asia/Manila' } }));
    mockProductFindOne.mockReturnValue(chain({ _id: 'svc1', name: 'Haircut', price: 100 }));
    mockBookingFind.mockReturnValue(chain([]));
  });

  it('marks only slots before "now" (UTC instant comparison) as unavailable', async () => {
    // 09:30 Manila Oct 31
    vi.setSystemTime(new Date('2026-10-31T01:30:00Z'));

    const res = await availabilityGET(
      req(`/api/booking/availability?tenantId=${TENANT_ID}&serviceId=svc1&date=2026-10-31&startHour=9&endHour=11&slotInterval=60&duration=60`)
    );
    const body = await res.json();
    expect(res.status).toBe(200);

    const query = mockBookingFind.mock.calls[0][0];
    expect(query.startTime.$gte.toISOString()).toBe('2026-10-30T16:00:00.000Z');
    expect(query.startTime.$lte.toISOString()).toBe('2026-10-31T15:59:59.999Z');

    expect(body.data.date).toBe('2026-10-30T16:00:00.000Z');
    expect(body.data.slots).toEqual([
      { time: '2026-10-31T01:00:00.000Z', available: false }, // 09:00 Manila — past
      { time: '2026-10-31T02:00:00.000Z', available: true }, // 10:00 Manila
    ]);
  });

  it('applies closed holidays to the Manila calendar day', async () => {
    vi.setSystemTime(new Date('2026-10-30T20:00:00Z')); // 04:00 Manila Oct 31
    mockTenantFindOne.mockReturnValue(chain({
      _id: TENANT_ID,
      settings: {
        timezone: 'Asia/Manila',
        holidays: [{ id: 'h1', name: 'Halloween', type: 'single', date: '2026-10-31', isBusinessClosed: true }],
      },
    }));

    const res = await availabilityGET(
      req(`/api/booking/availability?tenantId=${TENANT_ID}&serviceId=svc1&date=2026-10-31&startHour=9&endHour=10`)
    );
    const body = await res.json();
    expect(body.data.closedHoliday).toEqual({ name: 'Halloween' });
    expect(body.data.slots.every((s: { available: boolean }) => !s.available)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// lib/analytics getSalesReport default periods
// ---------------------------------------------------------------------------

describe('getSalesReport — default periods in tenant timezone', () => {
  beforeEach(() => {
    mockTransactionFind.mockReturnValue(chain([
      // 07:00 Manila Oct 31 (still Oct 30 in UTC)
      { total: 100, paymentMethod: 'cash', createdAt: new Date('2026-10-30T23:00:00Z') },
    ]));
  });

  it('daily starts at Manila midnight and buckets by Manila date', async () => {
    vi.setSystemTime(new Date('2026-10-31T01:00:00Z'));
    const report = await getSalesReport(TENANT_ID, 'daily');
    expect(report.startDate.toISOString()).toBe('2026-10-30T16:00:00.000Z');
    expect(report.salesByDay).toEqual([{ date: '2026-10-31', sales: 100, transactions: 1 }]);
  });

  it('weekly starts at Manila Sunday midnight', async () => {
    // Sun Nov 1 03:00 Manila = Sat Oct 31 19:00Z — server-local would say Saturday
    vi.setSystemTime(new Date('2026-10-31T19:00:00Z'));
    const report = await getSalesReport(TENANT_ID, 'weekly');
    expect(report.startDate.toISOString()).toBe('2026-10-31T16:00:00.000Z');
  });

  it('monthly starts at Manila 1st-of-month midnight', async () => {
    vi.setSystemTime(new Date('2026-10-31T19:00:00Z')); // Nov 1 Manila
    const report = await getSalesReport(TENANT_ID, 'monthly');
    expect(report.startDate.toISOString()).toBe('2026-10-31T16:00:00.000Z');
  });
});
