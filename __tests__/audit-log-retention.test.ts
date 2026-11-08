import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

const mockFind = vi.fn();
vi.mock('@/models/AuditLog', () => ({ default: { find: (...args: unknown[]) => mockFind(...args) } }));
vi.mock('@/models/ArchivedAuditLog', () => ({ default: { collection: { collectionName: 'archivedauditlogs' } } }));

import { cleanupAuditLogs } from '@/lib/automations/audit-log-cleanup';

const DAY = 24 * 60 * 60 * 1000;

describe('audit log retention', () => {
  it('expires live logs after 90 days', async () => {
    const { default: AuditLog } = await vi.importActual<typeof import('@/models/AuditLog')>('@/models/AuditLog');
    const ttl = AuditLog.schema.indexes().find(([key]) => JSON.stringify(key) === '{"createdAt":1}');

    expect(ttl?.[1].expireAfterSeconds).toBe(90 * 24 * 60 * 60);
    // Loading the real model can pass the 5s default when the whole suite runs at once
  }, 30_000);

  it('archives a day before the TTL by default', async () => {
    const query = { select: vi.fn(), sort: vi.fn(), limit: vi.fn(), lean: vi.fn().mockResolvedValue([]) };
    query.select.mockReturnValue(query);
    query.sort.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    mockFind.mockReturnValue(query);

    await cleanupAuditLogs();

    const cutoff = mockFind.mock.calls[0][0].createdAt.$lt.getTime();
    expect(Math.round((Date.now() - cutoff) / DAY)).toBe(89);
  });
});
