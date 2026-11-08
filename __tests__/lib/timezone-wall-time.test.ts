import { describe, expect, it } from 'vitest';
import { tenantWallTimeToDate } from '@/lib/timezone';

describe('tenantWallTimeToDate', () => {
  it('reads a picked time as that time at the store', () => {
    expect(tenantWallTimeToDate('2026-11-08T10:00', 'Asia/Manila').toISOString()).toBe('2026-11-08T02:00:00.000Z');
    expect(tenantWallTimeToDate('2026-11-08T00:30', 'Asia/Manila').toISOString()).toBe('2026-11-07T16:30:00.000Z');
  });

  it('uses the offset in force on that day across a clock change', () => {
    // New York: EDT (-4) until Nov 1 2026, EST (-5) after
    expect(tenantWallTimeToDate('2026-10-31T09:00', 'America/New_York').toISOString()).toBe('2026-10-31T13:00:00.000Z');
    expect(tenantWallTimeToDate('2026-11-02T09:00', 'America/New_York').toISOString()).toBe('2026-11-02T14:00:00.000Z');
  });

  it('falls back to Manila for an unknown zone and keeps full timestamps as they are', () => {
    expect(tenantWallTimeToDate('2026-11-08T10:00', 'Not/AZone').toISOString()).toBe('2026-11-08T02:00:00.000Z');
    expect(tenantWallTimeToDate('2026-11-08T10:00:00.000Z', 'Asia/Manila').toISOString()).toBe('2026-11-08T10:00:00.000Z');
  });
});
