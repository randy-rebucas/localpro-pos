/**
 * Automations must use each tenant's timezone (default Asia/Manila, UTC+8)
 * for calendar/clock logic, even though the server clock (Vercel) is UTC.
 * All timestamps here are explicit UTC ('Z'); the process TZ is forced to UTC.
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';

const originalTz = vi.hoisted(() => {
  const prev = process.env.TZ;
  process.env.TZ = 'UTC';
  return prev;
});

const mocks = vi.hoisted(() => ({
  getAutomationTenants: vi.fn(),
  sendEmail: vi.fn(),
  sendSMS: vi.fn(),
  getSalesReport: vi.fn(),
  getLowStockProducts: vi.fn(),
  bookingFind: vi.fn(),
  bookingCreate: vi.fn(),
  templateFind: vi.fn(),
  transactionAggregate: vi.fn(),
  auditCount: vi.fn(),
  drawerCount: vi.fn(),
  drawerFind: vi.fn(),
  drawerUpdateOne: vi.fn(),
  tenantUpdateOne: vi.fn(),
  attendanceFind: vi.fn(),
  attendanceBulkWrite: vi.fn(),
  productFind: vi.fn(),
  productBulkWrite: vi.fn(),
  expenseAggregate: vi.fn(),
}));

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/automations/tenants', () => ({ getAutomationTenants: mocks.getAutomationTenants }));
vi.mock('@/lib/notifications', () => ({
  sendEmail: mocks.sendEmail,
  sendSMS: mocks.sendSMS,
  sendBookingReminder: vi.fn(),
}));
vi.mock('@/lib/analytics', () => ({ getSalesReport: mocks.getSalesReport }));
vi.mock('@/lib/stock', () => ({ getLowStockProducts: mocks.getLowStockProducts }));
vi.mock('@/models/Booking', () => ({ default: { find: mocks.bookingFind, create: mocks.bookingCreate } }));
vi.mock('@/models/RecurringBookingTemplate', () => ({ default: { find: mocks.templateFind } }));
vi.mock('@/models/Transaction', () => ({ default: { aggregate: mocks.transactionAggregate } }));
vi.mock('@/models/AuditLog', () => ({ default: { countDocuments: mocks.auditCount } }));
vi.mock('@/models/CashDrawerSession', () => ({
  default: { countDocuments: mocks.drawerCount, find: mocks.drawerFind, updateOne: mocks.drawerUpdateOne },
}));
vi.mock('@/models/Tenant', () => ({ default: { updateOne: mocks.tenantUpdateOne } }));
vi.mock('@/models/Attendance', () => ({ default: { find: mocks.attendanceFind, bulkWrite: mocks.attendanceBulkWrite } }));
vi.mock('@/models/Product', () => ({ default: { find: mocks.productFind, bulkWrite: mocks.productBulkWrite } }));
vi.mock('@/models/Expense', () => ({ default: { aggregate: mocks.expenseAggregate } }));
vi.mock('@/models/User', () => ({ default: {} }));

import { generateRecurringBookings, getOccurrenceDates } from '@/lib/automations/recurring-bookings';
import { sendSalesReport } from '@/lib/automations/report-delivery';
import { analyzeSalesTrends } from '@/lib/automations/sales-trend-analysis';
import { detectAttendanceViolations } from '@/lib/automations/attendance-violations';
import { autoClockOutForgottenSessions } from '@/lib/automations/attendance-auto-clockout';
import { detectSuspiciousActivity } from '@/lib/automations/suspicious-activity';
import { autoCloseCashDrawers, isLocalEndOfBusinessDay } from '@/lib/automations/cash-drawer-closure';
import { applyDynamicPricing } from '@/lib/automations/dynamic-pricing';
import { generatePurchaseOrders } from '@/lib/automations/purchase-orders';
import { previousCompleteLocalPeriod, localPeriodBefore } from '@/lib/automations/local-time';
import { isBusinessOpen, getHolidayForDate, getNextOpenTime } from '@/lib/business-hours';

/** Mongoose-style query chain whose terminal .lean() resolves to `result` (no thenable). */
function chain(result: unknown) {
  const c: Record<string, ReturnType<typeof vi.fn>> = {};
  c.select = vi.fn(() => c);
  c.populate = vi.fn(() => c);
  c.lean = vi.fn().mockResolvedValue(result);
  return c;
}

const MANILA_TENANT = {
  _id: 'tenant-1',
  name: 'Sari-Sari',
  slug: 'sari',
  settings: { timezone: 'Asia/Manila', emailNotifications: true, email: 'owner@example.com' },
};

function setNow(iso: string) {
  vi.setSystemTime(new Date(iso));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  mocks.sendEmail.mockResolvedValue(true);
  mocks.sendSMS.mockResolvedValue(true);
  mocks.getAutomationTenants.mockResolvedValue([MANILA_TENANT]);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

describe('process clock', () => {
  it('runs these tests with a UTC server clock', () => {
    expect(new Date('2026-10-31T23:00:00Z').getHours()).toBe(23);
  });
});

describe('local-time helpers', () => {
  const tz = 'Asia/Manila';
  it('previous complete day/week/month at 07:00 Manila', () => {
    // 2026-11-02T07:00 Manila (Monday) = 2026-11-01T23:00Z
    const now = new Date('2026-11-01T23:00:00Z');
    const day = previousCompleteLocalPeriod(now, 'daily', tz);
    expect(day.startYmd).toBe('2026-11-01');
    expect(day.start.toISOString()).toBe('2026-10-31T16:00:00.000Z');
    expect(day.end.toISOString()).toBe('2026-11-01T15:59:59.999Z');

    const week = previousCompleteLocalPeriod(now, 'weekly', tz);
    expect([week.startYmd, week.endYmd]).toEqual(['2026-10-26', '2026-11-01']);

    const month = previousCompleteLocalPeriod(new Date('2026-10-31T23:00:00Z'), 'monthly', tz);
    expect([month.startYmd, month.endYmd]).toEqual(['2026-10-01', '2026-10-31']);
    expect(month.start.toISOString()).toBe('2026-09-30T16:00:00.000Z');
    expect(month.end.toISOString()).toBe('2026-10-31T15:59:59.999Z');

    const before = localPeriodBefore(month, 'monthly', tz);
    expect([before.startYmd, before.endYmd]).toEqual(['2026-09-01', '2026-09-30']);
  });
});

describe('recurring bookings', () => {
  it('generates the template wall-clock time in Manila (09:00 → 01:00Z) on Manila dates', async () => {
    // 2026-11-02 00:30 Manila (Monday) — still Sunday Nov 1 in UTC
    setNow('2026-11-01T16:30:00Z');
    mocks.templateFind.mockReturnValue(chain([
      {
        _id: 'tpl-1',
        recurrenceType: 'weekly',
        daysOfWeek: [1],
        effectiveFrom: new Date('2026-10-01T00:00:00Z'),
        startTimeHour: 9,
        startTimeMinute: 0,
        duration: 60,
        customerName: 'Juan',
        serviceName: 'Haircut',
      },
    ]));
    mocks.bookingFind.mockReturnValue(chain([]));
    mocks.bookingCreate.mockResolvedValue({});

    const result = await generateRecurringBookings({ daysAhead: 0 });

    expect(mocks.getAutomationTenants.mock.calls[0][0].select).toContain('settings.timezone');
    expect(result.processed).toBe(1);
    const created = mocks.bookingCreate.mock.calls[0][0];
    expect(created.startTime.toISOString()).toBe('2026-11-02T01:00:00.000Z');
    expect(created.endTime.toISOString()).toBe('2026-11-02T02:00:00.000Z');
  });

  it('expands daily and monthly rules on tenant-local dates', () => {
    const now = new Date('2026-11-01T16:30:00Z'); // Nov 2 Manila
    const base = { effectiveFrom: new Date('2026-01-01T00:00:00Z') };
    expect(getOccurrenceDates({ ...base, recurrenceType: 'daily' }, 2, 'Asia/Manila', now))
      .toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
    expect(getOccurrenceDates({ ...base, recurrenceType: 'monthly', dayOfMonth: 2 }, 5, 'Asia/Manila', now))
      .toEqual(['2026-11-02']);
    expect(getOccurrenceDates(
      { ...base, recurrenceType: 'daily', effectiveTo: new Date('2026-11-02T15:00:00Z') }, 5, 'Asia/Manila', now
    )).toEqual(['2026-11-02']);
  });
});

describe('scheduled sales report', () => {
  beforeEach(() => {
    mocks.getSalesReport.mockResolvedValue({ totalSales: 10, totalTransactions: 1, averageTransaction: 10 });
  });

  it('daily at 07:00 Manila (23:00Z) covers the previous Manila day', async () => {
    setNow('2026-10-31T23:00:00Z'); // Nov 1 07:00 Manila
    await sendSalesReport({ period: 'daily' });
    const [, period, start, end] = mocks.getSalesReport.mock.calls[0];
    expect(period).toBe('daily');
    expect(start.toISOString()).toBe('2026-10-30T16:00:00.000Z'); // Oct 31 00:00 Manila
    expect(end.toISOString()).toBe('2026-10-31T15:59:59.999Z'); // Oct 31 23:59:59.999 Manila
  });

  it('weekly on Monday 07:00 Manila covers the previous Mon–Sun', async () => {
    setNow('2026-11-01T23:00:00Z'); // Mon Nov 2 07:00 Manila
    await sendSalesReport({ period: 'weekly' });
    const [, , start, end] = mocks.getSalesReport.mock.calls[0];
    expect(start.toISOString()).toBe('2026-10-25T16:00:00.000Z'); // Mon Oct 26 00:00 Manila
    expect(end.toISOString()).toBe('2026-11-01T15:59:59.999Z'); // Sun Nov 1 end Manila
  });

  it('monthly on the 1st 07:00 Manila covers the previous month', async () => {
    setNow('2026-10-31T23:00:00Z'); // Nov 1 07:00 Manila
    await sendSalesReport({ period: 'monthly' });
    const [, , start, end] = mocks.getSalesReport.mock.calls[0];
    expect(start.toISOString()).toBe('2026-09-30T16:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-31T15:59:59.999Z');
  });
});

describe('sales trend analysis', () => {
  it('daily at 08:00 Manila compares the previous Manila day with the day before', async () => {
    setNow('2026-11-01T00:00:00Z'); // Nov 1 08:00 Manila
    mocks.transactionAggregate.mockResolvedValue([]);
    await analyzeSalesTrends({ period: 'daily', comparePeriods: true });
    const match = mocks.transactionAggregate.mock.calls[0][0][0].$match;
    expect(match.$or[0].createdAt.$gte.toISOString()).toBe('2026-10-30T16:00:00.000Z');
    expect(match.$or[0].createdAt.$lte.toISOString()).toBe('2026-10-31T15:59:59.999Z');
    expect(match.$or[1].createdAt.$gte.toISOString()).toBe('2026-10-29T16:00:00.000Z');
    expect(match.$or[1].createdAt.$lte.toISOString()).toBe('2026-10-30T15:59:59.999Z');
  });

  it('weekly on Monday 08:00 Manila analyses last Mon–Sun vs the week before', async () => {
    setNow('2026-11-02T00:00:00Z'); // Mon Nov 2 08:00 Manila
    mocks.transactionAggregate.mockResolvedValue([]);
    await analyzeSalesTrends({ period: 'weekly' });
    const match = mocks.transactionAggregate.mock.calls[0][0][0].$match;
    expect(match.$or[0].createdAt.$gte.toISOString()).toBe('2026-10-25T16:00:00.000Z');
    expect(match.$or[0].createdAt.$lte.toISOString()).toBe('2026-11-01T15:59:59.999Z');
    expect(match.$or[1].createdAt.$gte.toISOString()).toBe('2026-10-18T16:00:00.000Z');
  });

  it('monthly on the 1st 08:00 Manila analyses last month vs the month before', async () => {
    setNow('2026-11-01T00:00:00Z');
    mocks.transactionAggregate.mockResolvedValue([]);
    await analyzeSalesTrends({ period: 'monthly' });
    const match = mocks.transactionAggregate.mock.calls[0][0][0].$match;
    expect(match.$or[0].createdAt.$gte.toISOString()).toBe('2026-09-30T16:00:00.000Z');
    expect(match.$or[0].createdAt.$lte.toISOString()).toBe('2026-10-31T15:59:59.999Z');
    expect(match.$or[1].createdAt.$gte.toISOString()).toBe('2026-08-31T16:00:00.000Z');
    expect(match.$or[1].createdAt.$lte.toISOString()).toBe('2026-09-30T15:59:59.999Z');
  });
});

describe('attendance violations', () => {
  it('at 06:00 Manila reviews the previous Manila day against a Manila 09:00 start', async () => {
    setNow('2026-10-31T22:00:00Z'); // Nov 1 06:00 Manila
    mocks.getAutomationTenants.mockResolvedValue([{
      ...MANILA_TENANT,
      settings: { ...MANILA_TENANT.settings, attendanceNotifications: { enabled: true, expectedStartTime: '09:00' } },
    }]);
    mocks.attendanceFind.mockReturnValue(chain([
      { _id: 'a1', clockIn: new Date('2026-10-31T01:40:00Z'), userId: { name: 'Ana', email: 'ana@example.com' } },
    ]));

    const result = await detectAttendanceViolations();

    const filter = mocks.attendanceFind.mock.calls[0][0];
    expect(filter.clockIn.$gt.toISOString()).toBe('2026-10-31T01:15:00.000Z'); // 09:15 Manila Oct 31
    expect(filter.clockIn.$lte.toISOString()).toBe('2026-10-31T15:59:59.999Z');
    expect(result.processed).toBe(1);
    expect(mocks.sendEmail.mock.calls[0][0].message).toContain('Minutes Late: 40');
  });
});

describe('attendance auto clock-out', () => {
  it('derives the expected shift from the Manila start time on the clock-in day', async () => {
    // Clocked in 08:30 Manila; expected 09:00–17:00 Manila (01:00Z–09:00Z) + 2h grace
    setNow('2026-10-31T11:30:00Z');
    mocks.getAutomationTenants.mockResolvedValue([{
      ...MANILA_TENANT,
      settings: { ...MANILA_TENANT.settings, attendanceNotifications: { expectedStartTime: '09:00' } },
    }]);
    mocks.attendanceFind.mockReturnValue(chain([
      { _id: 's1', clockIn: new Date('2026-10-31T00:30:00Z'), userId: { name: 'Ana', email: 'ana@example.com' } },
    ]));
    mocks.attendanceBulkWrite.mockResolvedValue({ modifiedCount: 1 });

    await autoClockOutForgottenSessions();

    const op = mocks.attendanceBulkWrite.mock.calls[0][0][0].updateOne;
    expect(op.update.$set.clockOut.toISOString()).toBe('2026-10-31T09:00:00.000Z');
    expect(op.update.$set.totalHours).toBe(8.5);
  });
});

describe('suspicious activity', () => {
  beforeEach(() => {
    mocks.transactionAggregate.mockResolvedValue([{ refunds: 9, voids: 0, largeDiscounts: 0 }]);
    mocks.auditCount.mockResolvedValue(0);
    mocks.drawerCount.mockResolvedValue(0);
    mocks.tenantUpdateOne.mockResolvedValue({});
  });

  it('counts "today" from Manila midnight and treats yesterday-Manila alerts as not today', async () => {
    setNow('2026-10-31T17:00:00Z'); // Nov 1 01:00 Manila
    mocks.getAutomationTenants.mockResolvedValue([
      // alerted Oct 31 18:00 Manila — previous local day (but "today" in UTC)
      { ...MANILA_TENANT, suspiciousActivityAlertedAt: new Date('2026-10-31T10:00:00Z') },
    ]);

    const result = await detectSuspiciousActivity();

    const opts = mocks.getAutomationTenants.mock.calls[0][0];
    expect(opts.filter.$or[0].suspiciousActivityAlertedAt.$not.$gte.toISOString()).toBe('2026-10-31T16:00:00.000Z');
    const match = mocks.transactionAggregate.mock.calls[0][0][0].$match;
    expect(match.createdAt.$gte.toISOString()).toBe('2026-10-31T16:00:00.000Z');
    expect(result.processed).toBe(1);
  });

  it('skips a tenant in another timezone already alerted during its local day', async () => {
    setNow('2026-10-31T17:00:00Z'); // 13:00 in New York (EDT)
    mocks.getAutomationTenants.mockResolvedValue([{
      ...MANILA_TENANT,
      settings: { ...MANILA_TENANT.settings, timezone: 'America/New_York' },
      suspiciousActivityAlertedAt: new Date('2026-10-31T05:00:00Z'), // 01:00 New York, same local day
    }]);

    const result = await detectSuspiciousActivity();

    expect(mocks.transactionAggregate).not.toHaveBeenCalled();
    expect(result.processed).toBe(0);
  });
});

describe('cash drawer auto-close', () => {
  it('closes at 23:00 Manila (15:00Z) without business hours (22:00 default)', async () => {
    setNow('2026-10-31T15:00:00Z');
    mocks.drawerFind.mockReturnValue(chain([]));
    await autoCloseCashDrawers();
    const filter = mocks.drawerFind.mock.calls[0][0];
    expect(filter.status).toBe('open');
    expect(filter.openingTime).toBeUndefined(); // end of day: close every open session
  });

  it('before the local close time only closes sessions from earlier local days', async () => {
    setNow('2026-10-31T15:00:00Z'); // Sat 23:00 Manila
    mocks.getAutomationTenants.mockResolvedValue([{
      ...MANILA_TENANT,
      settings: {
        ...MANILA_TENANT.settings,
        businessHours: { schedule: { saturday: { enabled: true, openTime: '10:00', closeTime: '23:30' } } },
      },
    }]);
    mocks.drawerFind.mockReturnValue(chain([]));
    await autoCloseCashDrawers();
    const filter = mocks.drawerFind.mock.calls[0][0];
    expect(filter.openingTime.$lt.toISOString()).toBe('2026-10-30T16:00:00.000Z'); // Oct 31 00:00 Manila
  });

  it('evaluates end of day in tenant-local time and business hours', () => {
    const tz = 'Asia/Manila';
    const sat2300 = new Date('2026-10-31T15:00:00Z');
    expect(isLocalEndOfBusinessDay(sat2300, {}, tz)).toBe(true);
    expect(isLocalEndOfBusinessDay(new Date('2026-10-31T13:00:00Z'), {}, tz)).toBe(false); // 21:00
    const schedule = (day: object) => ({ businessHours: { schedule: { saturday: day } } }) as never;
    expect(isLocalEndOfBusinessDay(sat2300, schedule({ enabled: true, openTime: '09:00', closeTime: '21:00' }), tz)).toBe(true);
    expect(isLocalEndOfBusinessDay(sat2300, schedule({ enabled: true, openTime: '18:00', closeTime: '02:00' }), tz)).toBe(false);
    expect(isLocalEndOfBusinessDay(new Date('2026-10-31T05:00:00Z'), schedule({ enabled: false }), tz)).toBe(true);
  });
});

describe('dynamic pricing', () => {
  it('applies happy hour at 14:30 Manila (06:30Z)', async () => {
    setNow('2026-10-31T06:30:00Z');
    mocks.productFind.mockReturnValue(chain([{ _id: 'p1', price: 100, stock: 5 }]));
    mocks.productBulkWrite.mockResolvedValue({});
    const result = await applyDynamicPricing({ enableTimeBased: true });
    expect(result.processed).toBe(1);
    expect(mocks.productBulkWrite.mock.calls[0][0][0].updateOne.update.$set.price).toBe(90);
  });

  it('does not apply happy hour at 14:30 UTC (22:30 Manila)', async () => {
    setNow('2026-10-31T14:30:00Z');
    mocks.productFind.mockReturnValue(chain([{ _id: 'p1', price: 100, stock: 5 }]));
    const result = await applyDynamicPricing({ enableTimeBased: true });
    expect(result.processed).toBe(0);
    expect(mocks.productBulkWrite).not.toHaveBeenCalled();
  });
});

describe('purchase orders', () => {
  it('stamps the PO number with the Manila date at 07:00 Manila (23:00Z previous UTC day)', async () => {
    setNow('2026-10-31T23:00:00Z'); // Nov 1 07:00 Manila
    mocks.getLowStockProducts.mockResolvedValue([
      { _id: 'p1', name: 'Rice', sku: 'R1', currentStock: 1, threshold: 10, price: 50 },
    ]);
    await generatePurchaseOrders();
    expect(mocks.sendEmail.mock.calls[0][0].message).toMatch(/Order Number: PO-20261101-/);
  });
});

describe('business hours', () => {
  const tz = 'Asia/Manila';
  const hours = {
    schedule: {
      monday: { enabled: true, openTime: '09:00', closeTime: '17:00', breaks: [{ start: '12:00', end: '13:00' }] },
      sunday: { enabled: false },
    },
  };

  it('evaluates opening hours on the Manila wall clock', () => {
    expect(isBusinessOpen(new Date('2026-11-02T01:30:00Z'), hours, undefined, tz).isOpen).toBe(true); // Mon 09:30
    expect(isBusinessOpen(new Date('2026-11-02T04:30:00Z'), hours, undefined, tz))
      .toEqual({ isOpen: false, reason: 'Closed for break' }); // Mon 12:30
    const closed = isBusinessOpen(new Date('2026-11-02T09:30:00Z'), hours, undefined, tz); // Mon 17:30
    expect(closed.isOpen).toBe(false);
    expect(closed.nextOpen?.toISOString()).toBe('2026-11-03T01:00:00.000Z');
    // Sun Nov 1 23:30Z is already Monday 07:30 in Manila: closed until 09:00 Manila
    const early = isBusinessOpen(new Date('2026-11-01T23:30:00Z'), hours, undefined, tz);
    expect(early.isOpen).toBe(false);
    expect(early.nextOpen?.toISOString()).toBe('2026-11-02T01:00:00.000Z');
  });

  it('defaults to Asia/Manila and resolves holidays on the Manila date', () => {
    const holidays = [{ id: 'h1', name: 'All Saints', date: '2026-11-01', type: 'single' as const, isBusinessClosed: true }];
    // 2026-10-31T16:30Z = Nov 1 00:30 Manila
    expect(getHolidayForDate(new Date('2026-10-31T16:30:00Z'), holidays)?.name).toBe('All Saints');
    expect(getHolidayForDate(new Date('2026-10-31T15:30:00Z'), holidays)).toBeNull();
  });

  it('finds the next opening across closed days in the Manila calendar', () => {
    // Sun Nov 1 10:00 Manila (closed Sunday) → Mon 09:00 Manila
    expect(getNextOpenTime(new Date('2026-11-01T02:00:00Z'), hours, undefined, tz)?.toISOString())
      .toBe('2026-11-02T01:00:00.000Z');
  });
});
