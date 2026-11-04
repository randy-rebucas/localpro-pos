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

vi.mock('@/models/Transaction', () => ({ default: { aggregate: vi.fn(), find: vi.fn() } }));
const repos = vi.hoisted(() => ({
  bookings: { list: vi.fn(), updateMany: vi.fn() },
  attendance: { list: vi.fn(), updateEach: vi.fn() },
  cashDrawerSessions: { list: vi.fn(), closeEach: vi.fn(), countDiscrepanciesSince: vi.fn() },
  tenants: { findById: vi.fn() },
  users: { listActiveLogins: vi.fn() },
  expenses: { listCashBetween: vi.fn() },
  discounts: { activateDue: vi.fn(), deactivateDue: vi.fn(), listLimitedUsedSince: vi.fn() },
  savedCarts: { listUpdatedBetween: vi.fn() },
  auditLogs: { activeUserIds: vi.fn(), failedLoginCounts: vi.fn() },
  transactions: { findByIdAcrossTenants: vi.fn(), list: vi.fn(), listAcrossTenants: vi.fn() },
}));
vi.mock('@/lib/db', () => ({ getRepos: () => repos }));

import { getActiveTenants } from '@/lib/tenant-active-query';
import Transaction from '@/models/Transaction';
import { sendEmail, sendBookingConfirmation } from '@/lib/notifications';

import { autoConfirmBookings } from '@/lib/automations/booking-confirmations';
import { detectNoShows } from '@/lib/automations/booking-no-show';
import { detectBreaks } from '@/lib/automations/break-detection';
import { expireInactiveSessions } from '@/lib/automations/session-expiration';
import { detectSuspiciousActivity } from '@/lib/automations/suspicious-activity';
import { manageDiscountStatus } from '@/lib/automations/discount-management';
import { autoCloseCashDrawers } from '@/lib/automations/cash-drawer-closure';
import { autoClockOutForgottenSessions } from '@/lib/automations/attendance-auto-clockout';
import { sendAbandonedCartReminders } from '@/lib/automations/abandoned-carts';
import { sendTransactionReceipt, sendPendingReceipts } from '@/lib/automations/transaction-receipts';

const calls = (fn: unknown): any[][] => (fn as { mock: { calls: any[][] } }).mock.calls; // eslint-disable-line @typescript-eslint/no-explicit-any

const oid = () => new mongoose.Types.ObjectId();
/** Repositories return ids as hex strings. */
const sid = () => oid().toHexString();
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
    repos.bookings.list.mockResolvedValue([]);
    await detectNoShows();
    expect(getActiveTenants).toHaveBeenCalledWith('settings');
    expect(repos.tenants.findById).not.toHaveBeenCalled();
  });

  it('single-tenant path projects the same fields', async () => {
    repos.tenants.findById.mockResolvedValue({ ...tenantA, _id: String(tenantA._id) });
    repos.bookings.list.mockResolvedValue([]);
    await detectNoShows({ tenantId: String(tenantA._id) });
    expect(getActiveTenants).not.toHaveBeenCalled();
    expect(repos.tenants.findById).toHaveBeenCalledWith(String(tenantA._id), { select: '_id slug name settings' });
    expect(calls(repos.bookings.list)[0][0]).toBe(String(tenantA._id));
  });
});

describe('autoConfirmBookings', () => {
  it('loads the schedule once, confirms non-overlapping bookings with one updateMany', async () => {
    const now = Date.now();
    const free = { _id: sid(), status: 'pending', startTime: new Date(now + 2 * HOUR), endTime: new Date(now + 3 * HOUR), customerName: 'Free', serviceName: 'Cut' };
    const clashA = { _id: sid(), status: 'pending', startTime: new Date(now + 5 * HOUR), endTime: new Date(now + 6 * HOUR), customerName: 'A', serviceName: 'Cut' };
    const clashB = { _id: sid(), status: 'confirmed', startTime: new Date(now + 5.5 * HOUR), endTime: new Date(now + 6.5 * HOUR), customerName: 'B', serviceName: 'Cut' };
    repos.bookings.list.mockResolvedValue([free, clashA, clashB]);
    repos.bookings.updateMany.mockResolvedValue(1);

    const res = await autoConfirmBookings();

    expect(repos.bookings.list).toHaveBeenCalledTimes(1);
    expect(calls(repos.bookings.list)[0][0]).toBe(String(tenantA._id));
    expect(repos.bookings.updateMany).toHaveBeenCalledTimes(1);
    const [tenantId, filter, set] = calls(repos.bookings.updateMany)[0];
    expect(tenantId).toBe(String(tenantA._id));
    expect(filter).toEqual({ ids: [free._id], status: 'pending' });
    expect(set).toEqual({ status: 'confirmed', confirmationSent: true });
    expect(sendBookingConfirmation).toHaveBeenCalledTimes(1);
    expect(res.processed).toBe(1);
  });
});

describe('detectNoShows', () => {
  it('marks all no-shows with one tenant-scoped updateMany', async () => {
    const b1 = { _id: sid(), startTime: new Date(Date.now() - 2 * HOUR), serviceName: 'Cut', customerEmail: 'c@x.test' };
    const b2 = { _id: sid(), startTime: new Date(Date.now() - 3 * HOUR), serviceName: 'Cut' };
    repos.bookings.list.mockResolvedValue([b1, b2]);
    repos.bookings.updateMany.mockResolvedValue(2);

    const res = await detectNoShows();

    const filter = calls(repos.bookings.list)[0][1] as Record<string, { gte?: Date }>;
    expect(filter.startTime.gte).toBeInstanceOf(Date); // bounded look-back
    expect(repos.bookings.updateMany).toHaveBeenCalledTimes(1);
    expect(calls(repos.bookings.updateMany)[0][0]).toBe(String(tenantA._id));
    expect(calls(repos.bookings.updateMany)[0][1]).toMatchObject({ ids: [b1._id, b2._id] });
    expect(res.processed).toBe(2);
  });
});

describe('detectBreaks', () => {
  it('uses one aggregate for last activity and one batched update', async () => {
    const u1 = oid();
    const u2 = oid();
    const clockIn = new Date(Date.now() - 4 * HOUR);
    repos.attendance.list.mockResolvedValue([
      { _id: sid(), userId: u1.toHexString(), clockIn },
      { _id: sid(), userId: u2.toHexString(), clockIn },
    ]);
    vi.mocked(Transaction.aggregate).mockResolvedValue([
      { _id: u1, last: new Date(Date.now() - 2 * HOUR) }, // idle -> break
      { _id: u2, last: new Date(Date.now() - 5 * 60 * 1000) }, // active
    ] as never);
    repos.attendance.updateEach.mockResolvedValue(undefined);

    const res = await detectBreaks();

    expect(Transaction.aggregate).toHaveBeenCalledTimes(1);
    // aggregate() doesn't cast: the repository's hex ids must reach it as ObjectIds
    const match = (calls(Transaction.aggregate)[0][0] as Array<{ $match?: { userId: { $in: unknown[] } } }>)[0].$match!;
    expect(match.userId.$in[0]).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(repos.attendance.updateEach).toHaveBeenCalledTimes(1);
    const [tenantId, updates] = calls(repos.attendance.updateEach)[0];
    expect(tenantId).toBe(String(tenantA._id));
    expect(updates).toHaveLength(1);
    expect(res.processed).toBe(1);
  });
});

describe('expireInactiveSessions', () => {
  it('matches the old per-user semantics with two activity reads', async () => {
    const stale = new Date(Date.now() - 48 * HOUR);
    const recentUser = { _id: String(oid()), lastLogin: new Date() };
    const oldLogsUser = { _id: String(oid()), lastLogin: new Date() }; // has only old logs -> expired
    const neverUser = { _id: String(oid()) }; // no logs, no lastLogin -> not expired
    const staleLoginUser = { _id: String(oid()), lastLogin: stale }; // no logs, stale login -> expired
    repos.users.listActiveLogins.mockResolvedValue([recentUser, oldLogsUser, neverUser, staleLoginUser]);
    repos.auditLogs.activeUserIds
      .mockResolvedValueOnce([recentUser._id]) // recent activity
      .mockResolvedValueOnce([oldLogsUser._id]); // any activity among the rest

    const res = await expireInactiveSessions();

    expect(repos.auditLogs.activeUserIds).toHaveBeenCalledTimes(2);
    expect(res.processed).toBe(2);
  });
});

describe('detectSuspiciousActivity', () => {
  it('alerts only when a daily threshold is crossed within the run window', async () => {
    vi.mocked(Transaction.aggregate).mockResolvedValue([
      { refundsToday: 6, refundsBeforeWindow: 4, voidsToday: 12, voidsBeforeWindow: 11, largeDiscountsInWindow: 0 },
    ] as never);
    repos.auditLogs.failedLoginCounts.mockResolvedValue({ failedToday: 0, failedBeforeWindow: 0 });
    repos.cashDrawerSessions.countDiscrepanciesSince.mockResolvedValue(0);

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
    repos.auditLogs.failedLoginCounts.mockResolvedValue({ failedToday: 7, failedBeforeWindow: 6 });
    repos.cashDrawerSessions.countDiscrepanciesSince.mockResolvedValue(0);

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
  it('uses bulk activate/deactivate with a validFrom window and does not reactivate old manual deactivations', async () => {
    vi.mocked(getActiveTenants).mockResolvedValue([{ ...tenantA, settings: { emailNotifications: false } }] as never);
    repos.discounts.activateDue.mockResolvedValue({ modified: 1, discounts: [] });
    repos.discounts.deactivateDue.mockResolvedValue({ modified: 2, discounts: [] });

    const before = Date.now();
    const res = await manageDiscountStatus();

    expect(repos.discounts.activateDue).toHaveBeenCalledTimes(1);
    expect(repos.discounts.deactivateDue).toHaveBeenCalledTimes(1);
    const [tenantId, opts] = calls(repos.discounts.activateDue)[0] as [string, { now: Date; validFromAfter: Date; withDocs: boolean }];
    expect(tenantId).toBe(String(tenantA._id));
    expect(opts.withDocs).toBe(false); // no emails -> no reads
    expect(calls(repos.discounts.deactivateDue)[0][1].withDocs).toBe(false);
    // only newly-started discounts: default 6h window + 2h grace
    expect(opts.validFromAfter).toBeInstanceOf(Date);
    expect(opts.now.getTime() - opts.validFromAfter.getTime()).toBe(8 * HOUR);
    expect(opts.now.getTime()).toBeGreaterThanOrEqual(before);
    expect(repos.discounts.listLimitedUsedSince).not.toHaveBeenCalled();
    expect(res.processed).toBe(3);
  });

  it('reads the affected discounts and sends emails when notifications are on', async () => {
    repos.discounts.activateDue.mockResolvedValue({
      modified: 1,
      discounts: [{ _id: 'd1', code: 'NEW', name: 'New', validUntil: new Date(Date.now() + 24 * HOUR), usageCount: 0 }],
    });
    repos.discounts.deactivateDue.mockResolvedValue({ modified: 0, discounts: [] });
    repos.discounts.listLimitedUsedSince.mockResolvedValue([]);

    const res = await manageDiscountStatus();

    expect(calls(repos.discounts.activateDue)[0][1].withDocs).toBe(true);
    expect(calls(repos.discounts.deactivateDue)[0][1].withDocs).toBe(true);
    expect(repos.discounts.listLimitedUsedSince).toHaveBeenCalledWith(String(tenantA._id), expect.any(Date));
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Discount Activated: NEW' }));
    expect(res.processed).toBe(1);
  });
});

describe('autoCloseCashDrawers', () => {
  it('computes per-cashier totals in one aggregate and closes via one batch', async () => {
    const cashier = { _id: sid(), name: 'Cashier', email: 'c@a.test' };
    const opening = new Date(Date.now() - 8 * HOUR);
    repos.cashDrawerSessions.list.mockResolvedValue([
      { _id: sid(), userId: cashier, openingTime: opening, openingAmount: 100 },
    ]);
    vi.mocked(Transaction.aggregate).mockResolvedValue([
      { s0: [{ salesCents: 25050, vatCents: 0, discountCents: 0 }] },
    ] as never);
    repos.expenses.listCashBetween.mockResolvedValue([{ _id: 'e1', amount: 50, date: new Date() }]);
    repos.cashDrawerSessions.closeEach.mockResolvedValue(undefined);

    const res = await autoCloseCashDrawers({ forceClose: true });

    const match = (calls(Transaction.aggregate)[0][0] as Array<{ $match?: { $or: Array<{ userId: unknown }> } }>)[0].$match!;
    expect(String(match.$or[0].userId)).toBe(cashier._id); // per-cashier, like manual close
    expect(match.$or[0].userId).toBeInstanceOf(mongoose.Types.ObjectId); // aggregate() doesn't cast
    const [tenantId, closings] = calls(repos.cashDrawerSessions.closeEach)[0];
    expect(tenantId).toBe(String(tenantA._id));
    expect(closings[0].closing.expectedAmount).toBe(300.5); // 100 + 250.50 - 50
    expect(repos.expenses.listCashBetween).toHaveBeenCalledWith(String(tenantA._id), opening, expect.any(Date));
    expect(res.processed).toBe(1);
  });
});

describe('autoClockOutForgottenSessions', () => {
  it('interprets expectedStartTime in the tenant timezone and writes one batch', async () => {
    vi.mocked(getActiveTenants).mockResolvedValue([{
      ...tenantA,
      settings: { attendanceNotifications: { enabled: true, expectedStartTime: '09:00' }, timezone: 'Asia/Manila' },
    }] as never);
    // 2026-01-05 08:30 Manila = 00:30Z → expected start 09:00 Manila (01:00Z), end 17:00 Manila (09:00Z)
    const clockIn = new Date('2026-01-05T00:30:00Z');
    repos.attendance.list.mockResolvedValue([{ _id: sid(), userId: null, clockIn }]);
    repos.attendance.updateEach.mockResolvedValue(undefined);

    const res = await autoClockOutForgottenSessions();

    const updates = calls(repos.attendance.updateEach)[0][1] as Array<{ ifOpen: boolean; set: { clockOut: Date } }>;
    expect(updates[0].ifOpen).toBe(true);
    expect(updates[0].set.clockOut.toISOString()).toBe('2026-01-05T09:00:00.000Z');
    expect(res.processed).toBe(1);
  });
});

describe('sendAbandonedCartReminders', () => {
  it('reads carts through the repository and passes ObjectIds to the aggregate', async () => {
    const converted = oid();
    const abandoned = oid();
    const updatedAt = new Date(Date.now() - 30 * HOUR);
    const cart = (owner: mongoose.Types.ObjectId, email: string) => ({
      _id: sid(),
      userId: { _id: owner.toHexString(), name: 'Ann', email },
      items: [{ name: 'Tea', price: 2, quantity: 1 }],
      total: 2,
      updatedAt,
    });
    repos.savedCarts.listUpdatedBetween.mockResolvedValue([cart(converted, 'done@x.test'), cart(abandoned, 'left@x.test')]);
    vi.mocked(Transaction.aggregate).mockResolvedValue([
      { _id: converted, last: new Date(updatedAt.getTime() + HOUR) }, // bought after saving the cart
    ] as never);

    const res = await sendAbandonedCartReminders();

    const [tenantId, range, opts] = calls(repos.savedCarts.listUpdatedBetween)[0];
    expect(tenantId).toBe(String(tenantA._id));
    expect(range.after.getTime()).toBeLessThan(range.upTo.getTime());
    expect(opts).toEqual({ limit: 100 });
    // aggregate() doesn't cast: the repository's hex ids must reach it as ObjectIds
    const match = (calls(Transaction.aggregate)[0][0] as Array<{ $match?: { userId: { $in: unknown[] } } }>)[0].$match!;
    expect(match.userId.$in).toHaveLength(2);
    expect(match.userId.$in[0]).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(calls(sendEmail)[0][0].to).toBe('left@x.test');
    expect(res.processed).toBe(1);
  });

  it('skips carts whose owner no longer exists', async () => {
    repos.savedCarts.listUpdatedBetween.mockResolvedValue([
      { _id: sid(), userId: null, items: [], total: 0, updatedAt: new Date(Date.now() - 30 * HOUR) },
    ]);

    const res = await sendAbandonedCartReminders();

    expect(Transaction.aggregate).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(res.processed).toBe(0);
  });
});

describe('transaction receipts', () => {
  const receiptTenantId = sid();
  const sale = {
    _id: sid(),
    tenantId: receiptTenantId,
    receiptNumber: 'R-1',
    createdAt: new Date(),
    items: [{ name: 'Tea', price: 2, quantity: 1, subtotal: 2 }],
    subtotal: 2,
    total: 2,
    paymentMethod: 'cash',
    notes: 'email: buyer@x.test',
  };

  it('resolves the tenant settings from the id string and sends the receipt', async () => {
    repos.transactions.findByIdAcrossTenants.mockResolvedValue(sale);
    repos.tenants.findById.mockResolvedValue({
      settings: {
        emailNotifications: true,
        companyName: 'Acme',
        currency: 'PHP',
        numberFormat: { decimalSeparator: '.', thousandsSeparator: ',', decimalPlaces: 2 },
      },
    });

    const res = await sendTransactionReceipt({ transactionId: sale._id });

    expect(repos.tenants.findById).toHaveBeenCalledWith(receiptTenantId, { select: 'settings' });
    expect(calls(sendEmail)[0][0]).toMatchObject({ to: 'buyer@x.test', subject: 'Receipt from Acme - R-1' });
    expect(res.processed).toBe(1);
  });

  it('scopes the pending batch by tenant only when one is given', async () => {
    repos.transactions.list.mockResolvedValue([]);
    repos.transactions.listAcrossTenants.mockResolvedValue([]);

    await sendPendingReceipts({ tenantId: receiptTenantId, hoursAgo: 2 });
    await sendPendingReceipts();

    const [tenantId, filter, opts] = calls(repos.transactions.list)[0];
    expect(tenantId).toBe(receiptTenantId);
    expect(filter).toMatchObject({ status: 'completed', createdAt: { gte: expect.any(Date) } });
    expect(opts).toEqual({ sort: '-createdAt', limit: 100 });
    expect(repos.transactions.listAcrossTenants).toHaveBeenCalledTimes(1);
  });
});
