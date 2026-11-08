import type { BusinessHours } from '@/lib/business-hours';

export const WEEK_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SPECIAL_DAYS = 400;

export interface BusinessHoursInputError {
  key: string;
  fallback: string;
  /** Filled into `{value}` in the message. */
  value?: string;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const isTime = (v: unknown): v is string => typeof v === 'string' && HHMM.test(v);
const optTime = (v: unknown) => v === undefined || v === null || v === '' || isTime(v);

/** A real calendar date in YYYY-MM-DD (rejects 2026-02-30). */
function isRealDate(v: unknown): v is string {
  if (typeof v !== 'string' || !YMD.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

type Parsed = Pick<BusinessHours, 'timezone' | 'schedule' | 'specialHours'>;

/**
 * Checks a business-hours PUT body and rebuilds it from known fields only, so the tenant
 * document never stores stray keys. Fields left out of the body stay undefined (unchanged).
 * Overnight hours (close before open) are allowed; equal open and close times are not.
 */
export function parseBusinessHoursInput(body: unknown): { ok: true; data: Parsed } | { ok: false; error: BusinessHoursInputError } {
  const fail = (key: string, fallback: string, value?: string) => ({ ok: false as const, error: { key, fallback, value } });
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('validation.invalidRequest', 'Invalid request');
  const b = body as Record<string, unknown>;
  const data: Parsed = {};

  if (b.timezone !== undefined) {
    if (typeof b.timezone !== 'string' || !b.timezone.trim() || !isValidTimeZone(b.timezone.trim())) {
      return fail('validation.invalidTimezone', 'Choose a valid time zone');
    }
    data.timezone = b.timezone.trim();
  }

  if (b.schedule !== undefined) {
    if (!b.schedule || typeof b.schedule !== 'object' || Array.isArray(b.schedule)) return fail('validation.invalidRequest', 'Invalid request');
    const schedule: NonNullable<BusinessHours['schedule']> = {};
    for (const [day, raw] of Object.entries(b.schedule as Record<string, unknown>)) {
      if (!(WEEK_DAYS as readonly string[]).includes(day) || !raw || typeof raw !== 'object') {
        return fail('validation.invalidRequest', 'Invalid request');
      }
      const e = raw as Record<string, unknown>;
      const enabled = e.enabled === true;
      if (!optTime(e.openTime) || !optTime(e.closeTime)) return fail('validation.invalidHoursTime', 'Use a 24-hour time (HH:MM) for {value}', day);
      if (enabled && (!isTime(e.openTime) || !isTime(e.closeTime))) return fail('validation.hoursMissing', 'Set opening and closing times for {value}', day);
      if (enabled && e.openTime === e.closeTime) return fail('validation.hoursSameTime', 'Opening and closing times are the same on {value}', day);
      let breaks: Array<{ start: string; end: string }> | undefined;
      if (e.breaks !== undefined) {
        if (!Array.isArray(e.breaks)) return fail('validation.invalidRequest', 'Invalid request');
        breaks = [];
        for (const br of e.breaks as Array<Record<string, unknown> | null>) {
          if (!br || !isTime(br.start) || !isTime(br.end)) return fail('validation.invalidHoursTime', 'Use a 24-hour time (HH:MM) for {value}', day);
          breaks.push({ start: br.start, end: br.end });
        }
      }
      schedule[day] = {
        enabled,
        ...(isTime(e.openTime) && { openTime: e.openTime }),
        ...(isTime(e.closeTime) && { closeTime: e.closeTime }),
        ...(breaks && { breaks }),
      };
    }
    data.schedule = schedule;
  }

  if (b.specialHours !== undefined) {
    if (!Array.isArray(b.specialHours)) return fail('validation.invalidRequest', 'Invalid request');
    if (b.specialHours.length > MAX_SPECIAL_DAYS) return fail('validation.tooManySpecialDays', 'Too many special dates; remove past ones first');
    const seen = new Set<string>();
    const specialHours: NonNullable<BusinessHours['specialHours']> = [];
    for (const raw of b.specialHours as Array<Record<string, unknown> | null>) {
      if (!raw || !isRealDate(raw.date)) return fail('validation.specialDateInvalid', 'Every special date needs a valid date');
      if (seen.has(raw.date)) return fail('validation.specialDateDuplicate', '{value} is listed twice', raw.date);
      seen.add(raw.date);
      const enabled = raw.enabled !== false;
      if (!optTime(raw.openTime) || !optTime(raw.closeTime)) return fail('validation.invalidHoursTime', 'Use a 24-hour time (HH:MM) for {value}', raw.date);
      if (enabled && (!isTime(raw.openTime) || !isTime(raw.closeTime))) return fail('validation.hoursMissing', 'Set opening and closing times for {value}', raw.date);
      if (enabled && raw.openTime === raw.closeTime) return fail('validation.hoursSameTime', 'Opening and closing times are the same on {value}', raw.date);
      const note = typeof raw.note === 'string' ? raw.note.trim().slice(0, 100) : '';
      specialHours.push({
        date: raw.date,
        enabled,
        ...(enabled && { openTime: raw.openTime as string, closeTime: raw.closeTime as string }),
        ...(note && { note }),
      });
    }
    specialHours.sort((a, z) => a.date.localeCompare(z.date));
    data.specialHours = specialHours;
  }

  return { ok: true, data };
}
