import { describe, it, expect } from 'vitest';
import ArchivedAuditLog from '@/models/ArchivedAuditLog';
import Attendance from '@/models/Attendance';
import Booking from '@/models/Booking';
import SuperAdminAction from '@/models/SuperAdminAction';

const DAY = 24 * 60 * 60;

// These must equal the production TTLs: a difference makes an index sync rebuild or drop them.
describe('TTL indexes match production', () => {
  it.each([
    ['ArchivedAuditLog', ArchivedAuditLog, 'createdAt', 3660],
    ['SuperAdminAction', SuperAdminAction, 'createdAt', 3660],
    ['Attendance', Attendance, 'clockIn', 1830],
    ['Booking', Booking, 'endTime', 1830],
  ] as const)('%s', (_name, model, field, days) => {
    const ttl = model.schema.indexes().find(([key]) => JSON.stringify(key) === JSON.stringify({ [field]: 1 }));

    expect(ttl?.[1].expireAfterSeconds).toBe(days * DAY);
  });
});
