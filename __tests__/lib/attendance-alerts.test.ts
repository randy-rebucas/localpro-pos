import { describe, expect, it } from 'vitest';
import { findAttendanceAlerts } from '@/lib/attendance-alerts';

const person = { _id: 'u1', name: 'Sample Staff', email: 'staff@example.com' };
const base = { now: new Date('2026-11-08T06:00:00Z'), timeZone: 'Asia/Manila', expectedStartTime: '09:00', maxHours: 12 };

describe('findAttendanceAlerts', () => {
  it('reads the expected start at the store, not in the server zone', () => {
    // 09:10 and 09:30 in Manila
    const alerts = findAttendanceAlerts({
      ...base,
      openSessions: [],
      todaysSessions: [
        { _id: 'a1', clockIn: '2026-11-08T01:10:00Z', userId: person },
        { _id: 'a2', clockIn: '2026-11-08T01:30:00Z', userId: person },
      ],
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ type: 'late_arrival', attendanceId: 'a2', minutesLate: 30, userEmail: 'staff@example.com' });
    expect(alerts[0].expectedTime?.toISOString()).toBe('2026-11-08T01:00:00.000Z');
  });

  it('flags sessions left open longer than the limit', () => {
    const alerts = findAttendanceAlerts({
      ...base,
      openSessions: [
        { _id: 'o1', clockIn: '2026-11-07T17:00:00Z', userId: person }, // 13h ago
        { _id: 'o2', clockIn: '2026-11-08T00:00:00Z', userId: 'u2' }, // 6h ago
      ],
      todaysSessions: [],
    });
    expect(alerts.map((a) => a.attendanceId)).toEqual(['o1']);
    expect(alerts[0]).toMatchObject({ type: 'missing_clock_out', hoursSinceClockIn: '13.00' });
  });

  it('falls back to 09:00 when the start time is malformed', () => {
    const alerts = findAttendanceAlerts({
      ...base,
      expectedStartTime: 'nine',
      openSessions: [],
      todaysSessions: [{ _id: 'a1', clockIn: '2026-11-08T01:30:00Z', userId: 'u2' }],
    });
    expect(alerts[0]).toMatchObject({ minutesLate: 30, userName: 'Unknown', userEmail: null });
  });
});
