import { describe, it, expect } from 'vitest';
import { getClosedHolidayForDate, nextHolidayDate, parseHolidayInput, type Holiday } from '@/lib/holidays';

const christmas: Holiday = { id: 'h1', name: 'Christmas', type: 'single', date: '2026-12-25', isBusinessClosed: true };
const sundays: Holiday = { id: 'h2', name: 'Sundays', type: 'recurring', recurring: { pattern: 'weekly', dayOfWeek: 0 }, isBusinessClosed: true };

describe('getClosedHolidayForDate', () => {
  it('reads the day in the tenant zone', () => {
    // 07:00 on Dec 25 in Manila is 23:00 on Dec 24 in UTC.
    const at = new Date('2026-12-24T23:00:00Z');
    expect(getClosedHolidayForDate([christmas], at, 'Asia/Manila')?.id).toBe('h1');
    expect(getClosedHolidayForDate([christmas], at, 'UTC')).toBeNull();
  });

  it('reads the weekday in the tenant zone', () => {
    // Sunday 06:00 in Manila is Saturday 22:00 in UTC.
    const at = new Date('2026-11-07T22:00:00Z');
    expect(getClosedHolidayForDate([sundays], at, 'Asia/Manila')?.id).toBe('h2');
    expect(getClosedHolidayForDate([sundays], at, 'UTC')).toBeNull();
  });

  it('ignores holidays that keep the business open', () => {
    const open = { ...christmas, isBusinessClosed: false };
    expect(getClosedHolidayForDate([open], new Date('2026-12-25T04:00:00Z'), 'Asia/Manila')).toBeNull();
  });

  it('falls back to the server zone for an unknown zone', () => {
    const at = new Date(2026, 11, 25, 12);
    expect(getClosedHolidayForDate([christmas], at, 'Not/AZone')?.id).toBe('h1');
  });
});

describe('parseHolidayInput', () => {
  it('keeps only the fields a single date uses', () => {
    const r = parseHolidayInput({ name: ' New Year ', type: 'single', date: '2027-01-01', recurring: { pattern: 'weekly', dayOfWeek: 1 } });
    expect(r).toEqual({ ok: true, value: { name: 'New Year', type: 'single', date: '2027-01-01', isBusinessClosed: true } });
  });

  it('rejects a date that is not a real day', () => {
    expect(parseHolidayInput({ name: 'X', type: 'single', date: '2026-02-30' }).ok).toBe(false);
    expect(parseHolidayInput({ name: 'X', type: 'single', date: '25/12/2026' }).ok).toBe(false);
  });

  it('keeps only the fields each pattern uses', () => {
    const yearly = parseHolidayInput({ name: 'X', type: 'recurring', recurring: { pattern: 'yearly', month: 12, dayOfMonth: 25, dayOfWeek: 0 } }, new Date('2026-06-01'));
    expect(yearly).toEqual({ ok: true, value: { name: 'X', type: 'recurring', date: '2026-12-25', recurring: { pattern: 'yearly', month: 12, dayOfMonth: 25 }, isBusinessClosed: true } });
    const weekly = parseHolidayInput({ name: 'X', type: 'recurring', recurring: { pattern: 'weekly', dayOfWeek: 6, month: 3 } });
    expect(weekly.ok && weekly.value.recurring).toEqual({ pattern: 'weekly', dayOfWeek: 6 });
  });

  it('rejects out-of-range recurring values', () => {
    expect(parseHolidayInput({ name: 'X', type: 'recurring', recurring: { pattern: 'yearly', month: 2, dayOfMonth: 30 } }).ok).toBe(false);
    expect(parseHolidayInput({ name: 'X', type: 'recurring', recurring: { pattern: 'yearly', month: 2, dayOfMonth: 29 } }).ok).toBe(true);
    expect(parseHolidayInput({ name: 'X', type: 'recurring', recurring: { pattern: 'monthly', dayOfMonth: 32 } }).ok).toBe(false);
    expect(parseHolidayInput({ name: 'X', type: 'recurring', recurring: { pattern: 'weekly', dayOfWeek: 7 } }).ok).toBe(false);
    expect(parseHolidayInput({ name: 'X', type: 'recurring' }).ok).toBe(false);
  });

  it('requires a name of sensible length', () => {
    expect(parseHolidayInput({ name: '  ', type: 'single', date: '2026-12-25' }).ok).toBe(false);
    expect(parseHolidayInput({ name: 'x'.repeat(101), type: 'single', date: '2026-12-25' }).ok).toBe(false);
  });

  it('honours an explicit open day', () => {
    const r = parseHolidayInput({ name: 'X', type: 'single', date: '2026-12-25', isBusinessClosed: false });
    expect(r.ok && r.value.isBusinessClosed).toBe(false);
  });
});

describe('nextHolidayDate', () => {
  it('returns a single date until it passes', () => {
    expect(nextHolidayDate(christmas, '2026-12-25')).toBe('2026-12-25');
    expect(nextHolidayDate(christmas, '2026-12-26')).toBeNull();
  });

  it('finds the next weekday, today included', () => {
    expect(nextHolidayDate(sundays, '2026-11-08')).toBe('2026-11-08'); // a Sunday
    expect(nextHolidayDate(sundays, '2026-11-09')).toBe('2026-11-15');
  });

  it('skips months without the day', () => {
    const the31st: Holiday = { id: 'm', name: 'M', type: 'recurring', recurring: { pattern: 'monthly', dayOfMonth: 31 }, isBusinessClosed: true };
    expect(nextHolidayDate(the31st, '2026-11-08')).toBe('2026-12-31');
    expect(nextHolidayDate(the31st, '2026-12-31')).toBe('2026-12-31');
  });

  it('rolls a yearly date to next year, and leap days to a leap year', () => {
    const ny: Holiday = { id: 'y', name: 'Y', type: 'recurring', recurring: { pattern: 'yearly', month: 1, dayOfMonth: 1 }, isBusinessClosed: true };
    expect(nextHolidayDate(ny, '2026-11-08')).toBe('2027-01-01');
    const leap: Holiday = { id: 'l', name: 'L', type: 'recurring', recurring: { pattern: 'yearly', month: 2, dayOfMonth: 29 }, isBusinessClosed: true };
    expect(nextHolidayDate(leap, '2026-11-08')).toBe('2028-02-29');
  });
});
