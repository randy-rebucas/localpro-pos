import { describe, it, expect } from 'vitest';
import { bookableWindow, bookingFitsHours } from '@/lib/booking-hours';

const TZ = 'Asia/Manila'; // UTC+8, no DST
const manila = (day: string, time: string) => new Date(`${day}T${time}:00+08:00`);

const hours = {
  schedule: {
    monday: { enabled: true, openTime: '09:00', closeTime: '18:00', breaks: [{ start: '12:00', end: '13:00' }] },
    friday: { enabled: true, openTime: '18:00', closeTime: '02:00' }, // runs past midnight
    sunday: { enabled: false },
  },
  specialHours: [
    { date: '2026-11-09', enabled: true, openTime: '10:00', closeTime: '14:00', note: 'Short day' }, // a Monday
    { date: '2026-11-16', enabled: false, note: 'Stocktake' }, // a Monday
  ],
};

describe('bookableWindow', () => {
  it('gives no limit when the store has not set any hours', () => {
    expect(bookableWindow('2026-11-02', undefined, TZ)).toBeNull();
    expect(bookableWindow('2026-11-02', {}, TZ)).toBeNull();
  });

  it('reads the weekly hours as store time', () => {
    const w = bookableWindow('2026-11-02', hours, TZ); // Monday
    expect(w).not.toBe('closed');
    if (w && w !== 'closed') {
      expect(w.open.toISOString()).toBe(manila('2026-11-02', '09:00').toISOString());
      expect(w.close.toISOString()).toBe(manila('2026-11-02', '18:00').toISOString());
      expect(w.breaks).toHaveLength(1);
    }
  });

  it('closes a disabled day and a day missing from the weekly sign', () => {
    expect(bookableWindow('2026-11-08', hours, TZ)).toBe('closed'); // Sunday, disabled
    expect(bookableWindow('2026-11-03', hours, TZ)).toBe('closed'); // Tuesday, not listed
  });

  it('lets a special date override the weekly sign', () => {
    const w = bookableWindow('2026-11-09', hours, TZ);
    if (!w || w === 'closed') throw new Error('expected a window');
    expect(w.open.toISOString()).toBe(manila('2026-11-09', '10:00').toISOString());
    expect(w.breaks).toHaveLength(0);
    expect(bookableWindow('2026-11-16', hours, TZ)).toBe('closed');
  });

  it('ends an overnight day on the next calendar day', () => {
    const w = bookableWindow('2026-11-06', hours, TZ); // Friday 18:00 to Saturday 02:00
    if (!w || w === 'closed') throw new Error('expected a window');
    expect(w.close.toISOString()).toBe(manila('2026-11-07', '02:00').toISOString());
  });
});

describe('bookingFitsHours', () => {
  const fits = (day: string, from: string, to: string, endDay = day) =>
    bookingFitsHours(manila(day, from), manila(endDay, to), hours, TZ);

  it('accepts a booking inside the hours', () => {
    expect(fits('2026-11-02', '09:00', '10:00')).toEqual({ ok: true });
    expect(fits('2026-11-02', '17:00', '18:00')).toEqual({ ok: true });
  });

  it('rejects one that starts early, runs past closing, or overlaps a break', () => {
    expect(fits('2026-11-02', '08:30', '09:30')).toEqual({ ok: false, reason: 'outsideHours' });
    expect(fits('2026-11-02', '17:30', '18:30')).toEqual({ ok: false, reason: 'outsideHours' });
    expect(fits('2026-11-02', '11:30', '12:30')).toEqual({ ok: false, reason: 'break' });
  });

  it('rejects a booking on a closed day', () => {
    expect(fits('2026-11-08', '10:00', '11:00')).toEqual({ ok: false, reason: 'closedDay' });
  });

  it('accepts the early hours of an overnight day', () => {
    expect(fits('2026-11-07', '01:00', '02:00')).toEqual({ ok: true }); // Saturday 01:00, from Friday's hours
    expect(fits('2026-11-06', '23:30', '00:30', '2026-11-07')).toEqual({ ok: true });
  });

  it('allows anything when no hours are set', () => {
    expect(bookingFitsHours(manila('2026-11-08', '03:00'), manila('2026-11-08', '04:00'), undefined, TZ)).toEqual({ ok: true });
  });
});
