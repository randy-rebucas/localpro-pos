/**
 * Tests for the cron automations that load tenants via getActiveTenants()
 * and batch their per-document queries/writes.
 *
 * Never attach `.then` to a mock object (vitest thenable OOM) — query chains
 * below end in `lean: vi.fn().mockResolvedValue(...)`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

vi.mock('@/lib/tenant-active-query', () => ({ getActiveTenants: vi.fn() }));
vi.mock('@/lib/notifications', () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
  sendSMS: vi.fn().mockResolvedValue(true),
  sendBookingReminder: vi.fn().mockResolvedValue(true),
  sendBookingConfirmation: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/models/Tenant', () => ({ default: { findById: vi.fn(), find: vi.fn() } }));
vi.mock('@/models/User', () => ({ default: { find: vi.fn() } }));
vi.mock('@/models/Booking', () => ({ default: { find: vi.fn(), updateMany: vi.fn() } }));
vi.mock('@/models/Attendance', () => ({ default: { find: vi.fn(), bulkWrite: vi.fn() } }));
vi.mock('@/models/Transaction', () => ({ default: { aggregate: vi.fn(), find: vi.fn() } }));
vi.mock('@/models/AuditLog', () => ({ default: { aggregate: vi.fn(), distinct: vi.fn() } }));
vi.mock('@/models/CashDrawerSession', () => ({ default: { find: vi.fn(), countDocuments: vi.fn(), bulkWrite: vi.fn() } }));
vi.mock('@/models/Expense', () => ({ default: { find: vi.fn() } }));
vi.mock('@/models/Discount', () => ({ default: { find: vi.fn(), updateMany: vi.fn() } }));

import { getActiveTenants } from '@/lib/tenant-active-query';
import Tenant from '@/models/Tenant';
import User from '@/models/User';
import Booking from '@/models/Booking';
import Attendance from '@/models/Attendance';
import Transaction from '@/models/Transaction';
import AuditLog from '@/models/AuditLog';
import CashDrawerSession from '@/models/CashDrawerSession';
import Expense from '@/models/Expense';
import Discount from '@/models/Discount';
import { sendEmail, sendBookingConfirmation } from '@/lib/notifications';

import { autoConfirmBookings } from '@/lib/automations/booking-confirmations';
import { detectNoShows } from '@/lib/automations/booking-no-show';
import { detectBreaks } from '@/lib/automations/break-detection';
import { expireInactiveSessions } from '@/lib/automations/session-expiration';
import { detectSuspiciousActivity } from '@/lib/automations/suspicious-activity';
import { manageDiscountStatus } from '@/lib/automations/discount-management';
import { autoCloseCashDrawers } from '@/lib/automations/cash-drawer-closure';
import { autoClockOutForgottenSessions } from '@/lib/automations/attendance-auto-clockout';

/** Chainable mongoose query stub resolving `value` from `.lean()`. */
function chain(value: unknown) {
  const q: Record<string, ReturnType<typeof vi.fn>> = {};
  q.select = vi.fn(() => q);
  q.populate = vi.fn(() => q);
  q.sort = vi.fn(() => q);
  q.limit = vi.fn(() => q);
  q.lean = vi.fn().mockResolvedValue(value);
  return q;
}

const calls = (fn: unknown): any[][] => (fn as { mock: { calls: any[][] } }).mock.calls; // eslint-disable-line @typescript-eslint/no-explicit-any

const oid = () => new mongoose.Types.ObjectId();
const HOUR = 60 * 60 * 1000;

const tenantA = {
  _id: oid(),
  slug: 'a',
  name: 'Tenant A',
  settings: { emailNotifications: true, email: 'owner@a.test', timezone: 'Asia/Manila' },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getActiveTenants).mockResolvedValue([tenantA] as never);
});

describe('tenant loading', () => {
  it('uses getActiveTenants (not status:"active") with a field projection', async () => {
    vi.mocked(Booking.find).mockReturnValue(chain([]) as never);
    await detectNoShows();
    expect(getActiveTenants).toHaveBeenCalledWith('settings');
    expect(Tenant.find).not.toHaveBeenCalled();
  });

  it('single-tenant path projects the same fields', async () => {
    const q = chain(tenantA);
    vi.mocked(Tenant.findById).mockReturnValue(q as never);
    vi.mocked(Booking.find).mockReturnValue(chain([]) as never);
    await detectNoShows({ tenantId: String(tenantA._id) });
    expect(getActiveTenants).not.toHaveBeenCalled();
    expect(q.select).toHaveBeenCalledWith('_id slug name settings');
  });
});

describe('autoConfirmBookings', () => {
  it('loads the schedule once, confirms non-overlapping bookings with one updateMany', async () => {
    const now = Date.now();
    const free = { _id: oid(), status: 'pending', startTime: new Date(now + 2 * HOUR), endTime: new Date(now + 3 * HOUR), customerName: 'Free', serviceName: 'Cut' };
    const clashA = { _id: oid(), status: 'pending', startTime: new Date(now + 5 * HOUR), endTime: new Date(now + 6 * HOUR), customerName: 'A', serviceName: 'Cut' };
    const clashB = { _id: oid(), status: 'confirmed', startTime: new Date(now + 5.5 * HOUR), endTime: new Date(now + 6.5 * HOUR), customerName: 'B', serviceName: 'Cut' };
    vi.mocked(Booking.find).mockReturnValue(chain([free, clashA, clashB]) as never);
    vi.mocked(Booking.updateMany).mockResolvedValue({ modifiedCount: 1 } as never);

    const res = await autoConfirmBookings();

    expect(Booking.find).toHaveBeenCalledTimes(1);
    expect(calls(Booking.find)[0][0]).toMatchObject({ tenantId: tenantA._id });
    expect(Booking.updateMany).toHaveBeenCalledTimes(1);
    const [filter, update] = calls(Booking.updateMany)[0];
    expect(filter).toMatchObject({ tenantId: tenantA._id, status: 'pending', _id: { $in: [free._id] } });
    expect(update).toEqual({ $set: { status: 'confirmed', confirmationSent: true } });
    expect(sendBookingConfirmation).toHaveBeenCalledTimes(1);
    expect(res.processed).toBe(1);
  });
});

describe('detectNoShows', () => {
  it('marks all no-shows with one tenant-scoped updateMany', async () => {
    const b1 = { _id: oid(), startTime: new Date(Date.now() - 2 * HOUR), serviceName: 'Cut', customerEmail: 'c@x.test' };
    const b2 = { _id: oid(), startTime: new Date(Date.now() - 3 * HOUR), serviceName: 'Cut' };
    vi.mocked(Booking.find).mockReturnValue(chain([b1, b2]) as never);
    vi.mocked(Booking.updateMany).mockResolvedValue({ modifiedCount: 2 } as never);

    const res = await detectNoShows();

    const filter = calls(Booking.find)[0][0] as Record<string, { $gte?: Date }>;
    expect(filter.startTime.$gte).toBeInstanceOf(Date); // bounded look-back
    expect(Booking.updateMany).toHaveBeenCalledTimes(1);
    expect(calls(Booking.updateMany)[0][0]).toMatchObject({ tenantId: tenantA._id, _id: { $in: [b1._id, b2._id] } });
    expect(res.processed).toBe(2);
  });
});

describe('detectBreaks', () => {
  it('uses one aggregate for last activity and one bulkWrite', async () => {
    const u1 = oid();
    const u2 = oid();
    const clockIn = new Date(Date.now() - 4 * HOUR);
    vi.mocked(Attendance.find).mockReturnValue(chain([
      { _id: oid(), userId: u1, clockIn },
      { _id: oid(), userId: u2, clockIn },
    ]) as never);
    vi.mocked(Transaction.aggregate).mockResolvedValue([
      { _id: u1, last: new Date(Date.now() - 2 * HOUR) }, // idle -> break
      { _id: u2, last: new Date(Date.now() - 5 * 60 * 1000) }, // active
    ] as never);
    vi.mocked(Attendance.bulkWrite).mockResolvedValue({} as never);

    const res = await detectBreaks();

    expect(Transaction.aggregate).toHaveBeenCalledTimes(1);
    expect(Attendance.bulkWrite).toHaveBeenCalledTimes(1);
    const ops = calls(Attendance.bulkWrite)[0][0] as Array<{ updateOne: { filter: Record<string, unknown> } }>;
    expect(ops).toHaveLength(1);
    expect(ops[0].updateOne.filter.tenantId).toBeDefined();
    expect(res.processed).toBe(1);
  });
});

describe('expireInactiveSessions', () => {
  it('matches the old per-user semantics with distinct() queries', async () => {
    const stale = new Date(Date.now() - 48 * HOUR);
    const recentUser = { _id: oid(), lastLogin: new Date() };
    const oldLogsUser = { _id: oid(), lastLogin: new Date() }; // has only old logs -> expired
    const neverUser = { _id: oid() }; // no logs, no lastLogin -> not expired
    const staleLoginUser = { _id: oid(), lastLogin: stale }; // no logs, stale login -> expired
    vi.mocked(User.find).mockReturnValue(chain([recentUser, oldLogsUser, neverUser, staleLoginUser]) as never);
    vi.mocked(AuditLog.distinct)
      .mockResolvedValueOnce([recentUser._id] as never) // recent activity
      .mockResolvedValueOnce([oldLogsUser._id] as never); // any activity among the rest

    const res = await expireInactiveSessions();

    expect(AuditLog.distinct).toHaveBeenCalledTimes(2);
    expect(res.processed).toBe(2);
  });
});

describe('detectSuspiciousActivity', () => {
  it('alerts only when a daily threshold is crossed within the run window', async () => {
    vi.mocked(Transaction.aggregate).mockResolvedValue([
      { refundsToday: 6, refundsBeforeWindow: 4, voidsToday: 12, voidsBeforeWindow: 11, largeDiscountsInWindow: 0 },
    ] as never);
    vi.mocked(AuditLog.aggregate).mockResolvedValue([] as never);
    vi.mocked(CashDrawerSession.countDocuments).mockResolvedValue(0 as never);

    const res = await detectSuspiciousActivity();

    expect(res.processed).toBe(1);
    const msg = calls(sendEmail)[0][0].message as string;
    expect(msg).toContain('Excessive refunds'); // 4 -> 6 crosses 5
    expect(msg).not.toContain('Excessive voids'); // already >= 10 before window
  });

  it('sends nothing when every count was already over threshold before the window', async () => {
    vi.mocked(Transaction.aggregate).mockResolvedValue([
      { refundsToday: 9, refundsBeforeWindow: 8, voidsToday: 0, voidsBeforeWindow: 0, largeDiscountsInWindow: 0 },
    ] as never);
    vi.mocked(AuditLog.aggregate).mockResolvedValue([{ failedToday: 7, failedBeforeWindow: 6 }] as never);
    vi.mocked(CashDrawerSession.countDocuments).mockResolvedValue(0 as never);

    const res = await detectSuspiciousActivity();

    expect(res.processed).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('skips the scans for tenants that cannot receive email', async () => {
    vi.mocked(getActiveTenants).mockResolvedValue([{ ...tenantA, settings: { emailNotifications: false } }] as never);
    await detectSuspiciousActivity();
    expect(Transaction.aggregate).not.toHaveBeenCalled();
  });
});

describe('manageDiscountStatus', () => {
  it('uses updateMany with date conditions and does not reactivate old manual deactivations', async () => {
    vi.mocked(getActiveTenants).mockResolvedValue([{ ...tenantA, settings: { emailNotifications: false } }] as never);
    vi.mocked(Discount.updateMany)
      .mockResolvedValueOnce({ modifiedCount: 1 } as never)
      .mockResolvedValueOnce({ modifiedCount: 2 } as never);

    const res = await manageDiscountStatus();

    expect(Discount.find).not.toHaveBeenCalled(); // no emails -> no reads
    expect(Discount.updateMany).toHaveBeenCalledTimes(2);
    const [activateFilter] = calls(Discount.updateMany)[0] as [Record<string, { $gt?: Date }>];
    expect(activateFilter.tenantId).toBe(tenantA._id);
    expect(activateFilter.validFrom.$gt).toBeInstanceOf(Date); // only newly-started discounts
    expect(res.processed).toBe(3);
  });
});

describe('autoCloseCashDrawers', () => {
  it('computes per-cashier totals in one aggregate and closes via one bulkWrite', async () => {
    const cashier = { _id: oid(), name: 'Cashier', email: 'c@a.test' };
    const opening = new Date(Date.now() - 8 * HOUR);
    vi.mocked(CashDrawerSession.find).mockReturnValue(chain([
      { _id: oid(), userId: cashier, openingTime: opening, openingAmount: 100 },
    ]) as never);
    vi.mocked(Transaction.aggregate).mockResolvedValue([
      { s0: [{ salesCents: 25050, vatCents: 0, discountCents: 0 }] },
    ] as never);
    vi.mocked(Expense.find).mockReturnValue(chain([{ amount: 50, date: new Date() }]) as never);
    vi.mocked(CashDrawerSession.bulkWrite).mockResolvedValue({} as never);

    const res = await autoCloseCashDrawers({ forceClose: true });

    const match = (calls(Transaction.aggregate)[0][0] as Array<{ $match?: { $or: Array<{ userId: unknown }> } }>)[0].$match!;
    expect(String(match.$or[0].userId)).toBe(String(cashier._id)); // per-cashier, like manual close
    expect((match as unknown as { status: unknown }).status).toEqual({ $in: ['completed', 'refunded'] }); // refunds come out of the drawer
    const ops = calls(CashDrawerSession.bulkWrite)[0][0] as Array<{ updateOne: { filter: Record<string, unknown>; update: { $set: Record<string, unknown> } } }>;
    expect(ops[0].updateOne.filter.status).toBe('open');
    expect(ops[0].updateOne.update.$set.expectedAmount).toBe(300.5); // 100 + 250.50 - 50
    expect(res.processed).toBe(1);
  });
});

describe('autoClockOutForgottenSessions', () => {
  it('interprets expectedStartTime in the tenant timezone and writes one bulkWrite', async () => {
    vi.mocked(getActiveTenants).mockResolvedValue([{
      ...tenantA,
      settings: { attendanceNotifications: { enabled: true, expectedStartTime: '09:00' }, timezone: 'Asia/Manila' },
    }] as never);
    // 2026-01-05 08:30 Manila = 00:30Z → expected start 09:00 Manila (01:00Z), end 17:00 Manila (09:00Z)
    const clockIn = new Date('2026-01-05T00:30:00Z');
    vi.mocked(Attendance.find).mockReturnValue(chain([{ _id: oid(), userId: null, clockIn }]) as never);
    vi.mocked(Attendance.bulkWrite).mockResolvedValue({} as never);

    const res = await autoClockOutForgottenSessions();

    const ops = calls(Attendance.bulkWrite)[0][0] as Array<{ updateOne: { update: { $set: { clockOut: Date } } } }>;
    expect(ops[0].updateOne.update.$set.clockOut.toISOString()).toBe('2026-01-05T09:00:00.000Z');
    expect(res.processed).toBe(1);
  });
});
