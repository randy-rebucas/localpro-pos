import { describe, it, expect } from 'vitest';
import { parseBusinessHoursInput } from '@/lib/business-hours-input';

describe('parseBusinessHoursInput', () => {
  it('keeps known fields only and leaves unsent parts undefined', () => {
    const r = parseBusinessHoursInput({
      schedule: { monday: { enabled: true, openTime: '09:00', closeTime: '17:00', extra: 'x' }, sunday: { enabled: false } },
    });
    expect(r).toEqual({
      ok: true,
      data: { schedule: { monday: { enabled: true, openTime: '09:00', closeTime: '17:00' }, sunday: { enabled: false } } },
    });
  });

  it('allows overnight hours but not equal open and close', () => {
    expect(parseBusinessHoursInput({ schedule: { friday: { enabled: true, openTime: '22:00', closeTime: '02:00' } } })).toMatchObject({ ok: true });
    expect(parseBusinessHoursInput({ schedule: { friday: { enabled: true, openTime: '09:00', closeTime: '09:00' } } }))
      .toMatchObject({ ok: false, error: { key: 'validation.hoursSameTime', value: 'friday' } });
  });

  it('rejects unknown days, bad times and an open day without times', () => {
    expect(parseBusinessHoursInput({ schedule: { funday: { enabled: true } } })).toMatchObject({ ok: false });
    expect(parseBusinessHoursInput({ schedule: { monday: { enabled: true, openTime: '9am', closeTime: '17:00' } } }))
      .toMatchObject({ ok: false, error: { key: 'validation.invalidHoursTime' } });
    expect(parseBusinessHoursInput({ schedule: { monday: { enabled: true } } })).toMatchObject({ ok: false, error: { key: 'validation.hoursMissing' } });
  });

  it('validates the time zone', () => {
    expect(parseBusinessHoursInput({ timezone: 'Asia/Manila' })).toEqual({ ok: true, data: { timezone: 'Asia/Manila' } });
    expect(parseBusinessHoursInput({ timezone: 'Mars/Olympus' })).toMatchObject({ ok: false, error: { key: 'validation.invalidTimezone' } });
  });

  it('checks special dates: real, unique, sorted; closed days drop their times', () => {
    expect(parseBusinessHoursInput({ specialHours: [{ date: '2026-02-30', enabled: false }] })).toMatchObject({ ok: false, error: { key: 'validation.specialDateInvalid' } });
    expect(parseBusinessHoursInput({ specialHours: [{ date: '2026-12-25', enabled: false }, { date: '2026-12-25', enabled: false }] }))
      .toMatchObject({ ok: false, error: { key: 'validation.specialDateDuplicate', value: '2026-12-25' } });
    const r = parseBusinessHoursInput({
      specialHours: [
        { date: '2026-12-31', enabled: true, openTime: '10:00', closeTime: '15:00', note: ' New Year eve ' },
        { date: '2026-12-25', enabled: false, openTime: '09:00', closeTime: '17:00' },
      ],
    });
    expect(r).toEqual({
      ok: true,
      data: {
        specialHours: [
          { date: '2026-12-25', enabled: false },
          { date: '2026-12-31', enabled: true, openTime: '10:00', closeTime: '15:00', note: 'New Year eve' },
        ],
      },
    });
  });
});
