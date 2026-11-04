/**
 * Mongo operations repositories: tenant scoping, BookingFilter translation
 * (including the customer-contact rule) and the guarded batch writes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

import BookingModel from '@/models/Booking';
import RecurringBookingTemplateModel from '@/models/RecurringBookingTemplate';
import AttendanceModel from '@/models/Attendance';
import CashDrawerSessionModel from '@/models/CashDrawerSession';
import ZReadingModel from '@/models/ZReading';
import { mongoOperationsRepos as repos } from '@/lib/db/mongo/operations';

const TENANT = '64abc123def4567890abcdef';
const ID = '64abc123def4567890abc000';
const USER = '64abc123def4567890abc111';
const now = new Date('2026-11-01T00:00:00Z');

function leanQuery(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'populate', 'sort', 'skip', 'limit', 'session']) q[m] = vi.fn(() => q);
  q.lean = vi.fn().mockResolvedValue(result);
  return q;
}

const lastArgs = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls[spy.mock.calls.length - 1];

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('operations methods scope by tenant', () => {
  it('reads and counts', async () => {
    const spies = [
      vi.spyOn(BookingModel, 'find').mockReturnValue(leanQuery([]) as never),
      vi.spyOn(BookingModel, 'findOne').mockReturnValue(leanQuery(null) as never),
      vi.spyOn(RecurringBookingTemplateModel, 'find').mockReturnValue(leanQuery([]) as never),
      vi.spyOn(AttendanceModel, 'find').mockReturnValue(leanQuery([]) as never),
      vi.spyOn(AttendanceModel, 'findOne').mockReturnValue(leanQuery(null) as never),
      vi.spyOn(CashDrawerSessionModel, 'find').mockReturnValue(leanQuery([]) as never),
      vi.spyOn(CashDrawerSessionModel, 'findOne').mockReturnValue(leanQuery(null) as never),
      vi.spyOn(CashDrawerSessionModel, 'countDocuments').mockResolvedValue(0 as never),
      vi.spyOn(ZReadingModel, 'find').mockReturnValue(leanQuery([]) as never),
      vi.spyOn(ZReadingModel, 'findOne').mockReturnValue(leanQuery(null) as never),
    ];

    await repos.bookings.list(TENANT, { status: 'pending' });
    await repos.bookings.findOne(TENANT, { staffId: USER });
    await repos.bookings.findById(TENANT, ID);
    await repos.recurringBookingTemplates.listEffective(TENANT, now);
    await repos.attendance.list(TENANT, { open: true });
    await repos.attendance.findOpen(TENANT, USER);
    await repos.cashDrawerSessions.list(TENANT, { status: 'open' });
    await repos.cashDrawerSessions.findOpen(TENANT);
    await repos.cashDrawerSessions.count(TENANT);
    await repos.cashDrawerSessions.countDiscrepanciesSince(TENANT, now, { shortage: 50, overage: 100 });
    await repos.zReadings.list(TENANT, { limit: 30 });
    await repos.zReadings.findByBusinessDate(TENANT, now);

    for (const spy of spies) {
      expect(spy).toHaveBeenCalled();
      for (const [filter] of spy.mock.calls) expect(filter).toMatchObject({ tenantId: TENANT });
    }
  });

  it('creates cannot be redirected to another tenant by the input', async () => {
    const booking = vi.spyOn(BookingModel, 'create').mockResolvedValue([{ _id: ID }] as never);
    const clockIn = vi.spyOn(AttendanceModel, 'create').mockResolvedValue({ _id: ID } as never);
    const drawer = vi.spyOn(CashDrawerSessionModel, 'create').mockResolvedValue({ _id: ID } as never);
    const reading = vi.spyOn(ZReadingModel, 'create').mockResolvedValue({ _id: ID } as never);

    await repos.bookings.create(TENANT, { tenantId: 'other' } as never);
    await repos.attendance.clockIn(TENANT, { userId: USER, clockIn: now, tenantId: 'other' } as never);
    await repos.cashDrawerSessions.open(TENANT, { userId: USER, tenantId: 'other' } as never);
    await repos.zReadings.create(TENANT, { tenantId: 'other' } as never);

    expect((booking.mock.calls[0][0] as unknown as Record<string, unknown>[])[0]).toMatchObject({ tenantId: TENANT });
    expect(clockIn.mock.calls[0][0]).toMatchObject({ tenantId: TENANT });
    expect(drawer.mock.calls[0][0]).toMatchObject({ tenantId: TENANT, status: 'open' });
    expect(reading.mock.calls[0][0]).toMatchObject({ tenantId: TENANT });
  });

  it('countOpen(null) is the only cross-tenant count', async () => {
    const attendance = vi.spyOn(AttendanceModel, 'countDocuments').mockResolvedValue(0 as never);
    const drawers = vi.spyOn(CashDrawerSessionModel, 'countDocuments').mockResolvedValue(0 as never);

    await repos.attendance.countOpen(null, { clockInBefore: now });
    await repos.cashDrawerSessions.countOpen(null);
    expect(attendance.mock.calls[0][0]).toEqual({ clockOut: null, clockIn: { $lt: now } });
    expect(drawers.mock.calls[0][0]).toEqual({ status: 'open' });

    await repos.attendance.countOpen(TENANT);
    await repos.cashDrawerSessions.countOpen(TENANT);
    expect(lastArgs(attendance)[0]).toEqual({ tenantId: TENANT, clockOut: null });
    expect(lastArgs(drawers)[0]).toEqual({ tenantId: TENANT, status: 'open' });
  });
});

describe('BookingFilter translation', () => {
  async function query(filter: Parameters<typeof repos.bookings.list>[1]) {
    const spy = vi.spyOn(BookingModel, 'find').mockReturnValue(leanQuery([]) as never);
    await repos.bookings.list(TENANT, filter);
    return lastArgs(spy)[0] as Record<string, unknown>;
  }

  it('overlaps is the half-open interval check', async () => {
    const end = new Date('2026-11-01T01:00:00Z');
    expect(await query({ overlaps: { start: now, end }, status: ['pending', 'confirmed'], excludeId: ID })).toEqual({
      tenantId: TENANT,
      _id: { $ne: ID },
      status: { $in: ['pending', 'confirmed'] },
      startTime: { $lt: end },
      endTime: { $gt: now },
    });
  });

  it('ranges, excluded statuses, exact start times and the reminder flag', async () => {
    expect(await query({ startTime: { gte: now }, notStatus: ['cancelled'], reminderNotSent: true, notDisabled: true })).toEqual({
      tenantId: TENANT,
      startTime: { $gte: now },
      status: { $nin: ['cancelled'] },
      reminderSent: { $ne: true },
      isActive: { $ne: false },
    });
    expect((await query({ startTimeIn: [now] })).startTime).toEqual({ $in: [now] });
  });

  // Regression: `{ customerEmail: undefined }` reaches Mongo as null, which
  // matched every booking without an email (other customers' bookings)
  it('customerContact compares only the values that are set', async () => {
    expect((await query({ customerContact: { phone: '0917' } })).$or).toEqual([{ customerPhone: '0917' }]);
    expect((await query({ customerContact: { email: 'a@b.c' } })).$or).toEqual([{ customerEmail: 'a@b.c' }]);
    expect((await query({ customerContact: { email: 'a@b.c', phone: '0917' } })).$or).toEqual([
      { customerEmail: 'a@b.c' },
      { customerPhone: '0917' },
    ]);
  });

  it('customerContact with neither value matches nothing', async () => {
    expect((await query({ customerContact: {} })).$or).toEqual([{ _id: { $in: [] } }]);
  });
});

describe('writes', () => {
  it('bookings.updateMany sets flags within the tenant', async () => {
    const spy = vi.spyOn(BookingModel, 'updateMany').mockResolvedValue({ modifiedCount: 2 } as never);
    expect(await repos.bookings.updateMany(TENANT, { ids: [ID] }, { reminderSent: true })).toBe(2);
    expect(spy.mock.calls[0].slice(0, 2)).toEqual([{ tenantId: TENANT, _id: { $in: [ID] } }, { $set: { reminderSent: true } }]);
  });

  it('attendance.updateEach guards on an open session only when asked', async () => {
    const spy = vi.spyOn(AttendanceModel, 'bulkWrite').mockResolvedValue({} as never);
    await repos.attendance.updateEach(TENANT, [
      { id: ID, set: { clockOut: now }, ifOpen: true },
      { id: USER, set: { breakEnd: now } },
    ]);
    expect(spy.mock.calls[0][0]).toEqual([
      { updateOne: { filter: { _id: ID, tenantId: TENANT, clockOut: null }, update: { $set: { clockOut: now } } } },
      { updateOne: { filter: { _id: USER, tenantId: TENANT }, update: { $set: { breakEnd: now } } } },
    ]);
  });

  it('batch writes skip the database when there is nothing to do', async () => {
    const attendance = vi.spyOn(AttendanceModel, 'bulkWrite');
    const drawers = vi.spyOn(CashDrawerSessionModel, 'bulkWrite');
    await repos.attendance.updateEach(TENANT, []);
    await repos.cashDrawerSessions.closeEach(TENANT, []);
    expect(attendance).not.toHaveBeenCalled();
    expect(drawers).not.toHaveBeenCalled();
  });

  const closing = { closingAmount: 10, expectedAmount: 10, closingTime: now, totalVAT: 0, totalDiscounts: 0 };

  it('close only matches an open session and marks it closed', async () => {
    const spy = vi.spyOn(CashDrawerSessionModel, 'findOneAndUpdate').mockReturnValue(leanQuery(null) as never);
    expect(await repos.cashDrawerSessions.close(TENANT, ID, closing)).toBeNull();
    expect(spy.mock.calls[0].slice(0, 2)).toEqual([
      { _id: ID, tenantId: TENANT, status: 'open' },
      { $set: { ...closing, status: 'closed' } },
    ]);
  });

  it('closeEach skips drawers closed meanwhile', async () => {
    const spy = vi.spyOn(CashDrawerSessionModel, 'bulkWrite').mockResolvedValue({} as never);
    await repos.cashDrawerSessions.closeEach(TENANT, [{ id: ID, closing }]);
    expect(spy.mock.calls[0][0]).toEqual([
      { updateOne: { filter: { _id: ID, tenantId: TENANT, status: 'open' }, update: { $set: { ...closing, status: 'closed' } } } },
    ]);
  });
});
