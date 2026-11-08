import { describe, it, expect } from 'vitest';
import { getTenantMonthRange } from '@/lib/timezone';

describe('getTenantMonthRange', () => {
  it('starts the month at midnight on the 1st in Manila, not in UTC', () => {
    // 2026-11-30T20:00Z is already 04:00 on Dec 1 in Manila (UTC+8).
    const { start, end } = getTenantMonthRange('Asia/Manila', new Date('2026-11-30T20:00:00Z'));
    expect(start.toISOString()).toBe('2026-11-30T16:00:00.000Z'); // Dec 1, 00:00 Manila
    expect(end.toISOString()).toBe('2026-12-31T16:00:00.000Z'); // Jan 1, 00:00 Manila
  });

  it('keeps the current month just before midnight at the store', () => {
    const { start } = getTenantMonthRange('Asia/Manila', new Date('2026-11-30T15:59:00Z')); // Nov 30, 23:59 Manila
    expect(start.toISOString()).toBe('2026-10-31T16:00:00.000Z'); // Nov 1, 00:00 Manila
  });

  it('rolls December into January of the next year', () => {
    const { start, end } = getTenantMonthRange('UTC', new Date('2026-12-15T00:00:00Z'));
    expect(start.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('falls back to the default zone for an unknown time zone', () => {
    const now = new Date('2026-11-08T00:00:00Z');
    expect(getTenantMonthRange('Not/AZone', now)).toEqual(getTenantMonthRange(undefined, now));
  });
});
