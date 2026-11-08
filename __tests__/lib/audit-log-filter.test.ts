import { describe, it, expect } from 'vitest';
import { buildAuditLogQuery, auditQueryNeedsTimeZone } from '@/lib/audit-log-filter';

const TENANT = '64b000000000000000000001';
const USER = '64b0000000000000000000aa';
const p = (o: Record<string, string>) => new URLSearchParams(o);

describe('buildAuditLogQuery', () => {
  it('always scopes to the tenant and leaves other filters off when empty', () => {
    const r = buildAuditLogQuery(p({}), TENANT, 'Asia/Manila');
    expect(r).toEqual({ ok: true, query: { tenantId: TENANT }, start: undefined, end: undefined });
  });

  it('applies action, trimmed lower-case entity type and user', () => {
    const r = buildAuditLogQuery(p({ action: 'transaction.refund', entityType: '  Product ', userId: USER }), TENANT, 'Asia/Manila');
    expect(r.ok && r.query).toEqual({ tenantId: TENANT, action: 'transaction.refund', entityType: 'product', userId: USER });
  });

  it('reads picked dates as whole store days in the tenant zone', () => {
    const r = buildAuditLogQuery(p({ startDate: '2026-11-01', endDate: '2026-11-01' }), TENANT, 'Asia/Manila');
    if (!r.ok) throw new Error('expected ok');
    // Manila is UTC+8: the day runs 2026-10-31T16:00Z to just before 2026-11-01T16:00Z.
    expect(r.query.createdAt?.$gte?.toISOString()).toBe('2026-10-31T16:00:00.000Z');
    expect(r.query.createdAt?.$lte?.getTime()).toBeGreaterThan(new Date('2026-11-01T15:59:59.000Z').getTime());
    expect(r.query.createdAt?.$lte?.getTime()).toBeLessThan(new Date('2026-11-01T16:00:00.000Z').getTime());
  });

  it('fills a missing edge from the defaults (the export range)', () => {
    const start = new Date('2026-10-01T00:00:00Z');
    const end = new Date('2026-11-08T00:00:00Z');
    const r = buildAuditLogQuery(p({ action: 'user.login' }), TENANT, 'Asia/Manila', { start, end });
    expect(r.ok && r.query).toEqual({ tenantId: TENANT, action: 'user.login', createdAt: { $gte: start, $lte: end } });
  });

  it('keeps a picked date over the default', () => {
    const r = buildAuditLogQuery(p({ endDate: '2026-11-01' }), TENANT, 'Asia/Manila', { start: new Date(0), end: new Date() });
    if (!r.ok) throw new Error('expected ok');
    expect(r.query.createdAt?.$gte).toEqual(new Date(0));
    expect(r.end?.toISOString().startsWith('2026-11-01T15:59:59')).toBe(true);
  });

  it('rejects a date that does not parse', () => {
    expect(buildAuditLogQuery(p({ startDate: 'not-a-date' }), TENANT, 'Asia/Manila')).toEqual({ ok: false, reason: 'invalidDate' });
  });

  it('treats a malformed user id as matching nobody', () => {
    expect(buildAuditLogQuery(p({ userId: 'abc' }), TENANT, 'Asia/Manila')).toEqual({ ok: false, reason: 'noMatch' });
  });
});

describe('auditQueryNeedsTimeZone', () => {
  it('is true only when a date is set', () => {
    expect(auditQueryNeedsTimeZone(p({ action: 'x' }))).toBe(false);
    expect(auditQueryNeedsTimeZone(p({ startDate: '2026-11-01' }))).toBe(true);
    expect(auditQueryNeedsTimeZone(p({ endDate: ' ' }))).toBe(false);
  });
});
