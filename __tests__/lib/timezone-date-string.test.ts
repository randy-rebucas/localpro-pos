import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTenantDateString } from '@/lib/timezone';

describe('getTenantDateString', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 04:00 on Nov 8 in Manila, still Nov 7 in UTC and New York
    vi.setSystemTime(new Date('2026-11-07T20:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the calendar day in the store timezone', () => {
    expect(getTenantDateString('Asia/Manila')).toBe('2026-11-08');
    expect(getTenantDateString('America/New_York')).toBe('2026-11-07');
  });

  it('counts back whole calendar days, across month ends and clock changes', () => {
    expect(getTenantDateString('Asia/Manila', 8)).toBe('2026-10-31');
    expect(getTenantDateString('America/New_York', 7)).toBe('2026-10-31');
  });

  it('uses the default timezone when none is set or it is not recognised', () => {
    expect(getTenantDateString()).toBe('2026-11-08');
    expect(getTenantDateString('Not/AZone')).toBe('2026-11-08');
  });
});
