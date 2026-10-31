import { describe, it, expect } from 'vitest';
import {
  getTenantTimezone,
  getTenantLocalParts,
  getTenantYmd,
  addDaysToYmd,
  tenantLocalTimeToUtc,
  getTenantMonthBoundaries,
  getTenantDayBoundaries,
} from '@/lib/timezone';
import { getClosedHolidayForDate } from '@/lib/holidays';

describe('tenant timezone helpers', () => {
  it('falls back to Asia/Manila for missing or invalid timezones', () => {
    expect(getTenantTimezone(undefined)).toBe('Asia/Manila');
    expect(getTenantTimezone({ timezone: 'Not/AZone' })).toBe('Asia/Manila');
    expect(getTenantTimezone({ timezone: 'America/New_York' })).toBe('America/New_York');
  });

  it('reads local clock fields in the tenant timezone', () => {
    // 2026-10-31 18:30 UTC = 2026-11-01 02:30 in Manila (UTC+8), a Sunday
    const p = getTenantLocalParts(new Date('2026-10-31T18:30:00Z'), 'Asia/Manila');
    expect(p).toMatchObject({ year: 2026, month: 11, day: 1, hour: 2, minute: 30, weekday: 0, ymd: '2026-11-01' });
    expect(getTenantYmd(new Date('2026-10-31T15:59:59Z'), 'Asia/Manila')).toBe('2026-10-31');
  });

  it('shifts calendar dates across month and year ends', () => {
    expect(addDaysToYmd('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToYmd('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('converts local wall-clock time to UTC, including DST zones', () => {
    expect(tenantLocalTimeToUtc('2026-10-31', '22:00', 'Asia/Manila').toISOString()).toBe('2026-10-31T14:00:00.000Z');
    // New York: EDT (UTC-4) in July, EST (UTC-5) in December
    expect(tenantLocalTimeToUtc('2026-07-01', '09:00', 'America/New_York').toISOString()).toBe('2026-07-01T13:00:00.000Z');
    expect(tenantLocalTimeToUtc('2026-12-01', '09:00', 'America/New_York').toISOString()).toBe('2026-12-01T14:00:00.000Z');
  });

  it('returns month boundaries in the tenant timezone', () => {
    const { start, end } = getTenantMonthBoundaries(new Date('2026-10-15T00:00:00Z'), 'Asia/Manila');
    expect(start.toISOString()).toBe('2026-09-30T16:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-31T15:59:59.999Z');
  });

  it('checks closed holidays on the tenant-local date', () => {
    const holidays = [{ id: 'h', name: 'All Saints', type: 'single' as const, date: '2026-11-01', isBusinessClosed: true }];
    // 2026-10-31T17:00Z is 01:00 on Nov 1 in Manila
    expect(getClosedHolidayForDate(holidays, new Date('2026-10-31T17:00:00Z'), 'Asia/Manila')?.id).toBe('h');
    expect(getClosedHolidayForDate(holidays, new Date('2026-10-31T15:00:00Z'), 'Asia/Manila')).toBeNull();
  });

  it('day boundaries match Manila midnight', () => {
    const { start, end } = getTenantDayBoundaries('2026-10-31', 'Asia/Manila');
    expect(start.toISOString()).toBe('2026-10-30T16:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-31T15:59:59.999Z');
  });
});
