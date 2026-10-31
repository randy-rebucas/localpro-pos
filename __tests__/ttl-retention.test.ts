import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  counterFindOneAndUpdate: vi.fn(),
  auditFind: vi.fn(),
  auditDeleteMany: vi.fn(),
  archivedInsertMany: vi.fn(),
  getAutomationTenants: vi.fn(),
}));

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/automations/tenants', () => ({ getAutomationTenants: mocks.getAutomationTenants }));
vi.mock('@/models/AuditLog', () => ({
  default: { find: mocks.auditFind, deleteMany: mocks.auditDeleteMany },
}));
vi.mock('@/models/ArchivedAuditLog', () => ({
  default: { insertMany: mocks.archivedInsertMany },
}));

import Counter, { dailyCounterExpiresAt } from '@/models/Counter';
import PosSession from '@/models/PosSession';
import OfflineTransaction from '@/models/OfflineTransaction';
import SavedCart from '@/models/SavedCart';
import { generateReceiptNumber, generateInvoiceNumber } from '@/lib/receipt';
import { cleanupAuditLogs, isOnlyDuplicateKeyError } from '@/lib/automations/audit-log-cleanup';

const DAY = 24 * 60 * 60 * 1000;

describe('daily counter expiry', () => {
  it('expires 8 days after the start of the UTC day, never within the current day', () => {
    const lateInDay = new Date('2026-10-31T23:59:59.999Z');
    expect(dailyCounterExpiresAt(lateInDay).toISOString()).toBe('2026-11-08T00:00:00.000Z');
    expect(dailyCounterExpiresAt(lateInDay).getTime() - lateInDay.getTime()).toBeGreaterThan(7 * DAY);
  });

  it('declares a TTL index on expiresAt', () => {
    expect(Counter.schema.indexes()).toContainEqual([{ expiresAt: 1 }, expect.objectContaining({ expireAfterSeconds: 0 })]);
  });

  it.each([
    ['receipt', generateReceiptNumber, 'REC'],
    ['invoice', generateInvoiceNumber, 'INV'],
  ])('%s counter upsert sets expiresAt only on insert', async (_label, fn, prefix) => {
    const spy = vi.spyOn(Counter, 'findOneAndUpdate').mockResolvedValue({ seq: 7 } as never);
    const result = await fn('tenant1');
    expect(result).toMatch(new RegExp(`^${prefix}-\\d{8}-00007$`));
    const [filter, update, opts] = spy.mock.calls[0] as unknown as [
      { _id: string },
      { $inc: unknown; $setOnInsert: { expiresAt: Date } },
      { upsert: boolean },
    ];
    expect(filter._id).toMatch(new RegExp(`^${prefix}-\\d{8}-tenant1$`));
    expect(update.$inc).toEqual({ seq: 1 });
    expect(update.$setOnInsert.expiresAt.getTime()).toBeGreaterThan(Date.now() + 7 * DAY);
    expect(opts.upsert).toBe(true);
    spy.mockRestore();
  });
});

describe('TTL index declarations', () => {
  it('PosSession expires 1h after updatedAt, sessionId has a single unique index', () => {
    const idx = PosSession.schema.indexes();
    expect(idx).toContainEqual([{ updatedAt: 1 }, expect.objectContaining({ expireAfterSeconds: 3600 })]);
    expect(idx.some(([key]) => 'lastUpdate' in key)).toBe(false);
    expect(PosSession.schema.path('sessionId').options).toMatchObject({ unique: true });
    expect(PosSession.schema.path('sessionId').options.index).toBeUndefined();
  });

  it('OfflineTransaction expires synced rows 30d after syncedAt', () => {
    expect(OfflineTransaction.schema.indexes()).toContainEqual([
      { syncedAt: 1 },
      expect.objectContaining({ expireAfterSeconds: 30 * 86400, partialFilterExpression: { syncStatus: 'synced' } }),
    ]);
  });

  it('SavedCart expires soft-deleted rows 30d after updatedAt', () => {
    expect(SavedCart.schema.indexes()).toContainEqual([
      { updatedAt: 1 },
      expect.objectContaining({ expireAfterSeconds: 30 * 86400, partialFilterExpression: { isActive: false } }),
    ]);
  });
});

describe('isOnlyDuplicateKeyError', () => {
  it('accepts bulk errors made only of 11000s (array or single)', () => {
    expect(isOnlyDuplicateKeyError({ code: 11000, writeErrors: [{ code: 11000 }, { err: { code: 11000 } }] })).toBe(true);
    expect(isOnlyDuplicateKeyError({ code: 11000, writeErrors: { code: 11000 } })).toBe(true);
    expect(isOnlyDuplicateKeyError({ code: 11000 })).toBe(true);
  });

  it('rejects mixed, non-duplicate and validation failures', () => {
    expect(isOnlyDuplicateKeyError({ writeErrors: [{ code: 11000 }, { code: 121 }] })).toBe(false);
    expect(isOnlyDuplicateKeyError(new Error('network'))).toBe(false);
    expect(isOnlyDuplicateKeyError({ code: 11000, writeErrors: [{ code: 11000 }], mongoose: { validationErrors: [new Error('x')] } })).toBe(false);
    expect(isOnlyDuplicateKeyError(null)).toBe(false);
  });
});

describe('cleanupAuditLogs archive idempotency', () => {
  const logs = [
    { _id: 'a1', tenantId: 't1', action: 'x', entityType: 'y', createdAt: new Date('2020-01-01') },
    { _id: 'a2', tenantId: 't1', action: 'x', entityType: 'y', createdAt: new Date('2020-01-02') },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAutomationTenants.mockResolvedValue([{ _id: 't1', name: 'T1' }]);
    mocks.auditFind.mockReturnValue({ limit: () => ({ lean: vi.fn().mockResolvedValue(logs) }) });
    mocks.auditDeleteMany.mockResolvedValue({ deletedCount: 2 });
  });

  it('keeps original _id in archive copies', async () => {
    mocks.archivedInsertMany.mockResolvedValue([]);
    await cleanupAuditLogs();
    const [docs, opts] = mocks.archivedInsertMany.mock.calls[0];
    expect(docs.map((d: { _id: string }) => d._id)).toEqual(['a1', 'a2']);
    expect(opts).toMatchObject({ ordered: false });
  });

  it('treats duplicate-key errors as already archived and deletes originals', async () => {
    mocks.archivedInsertMany.mockRejectedValue(
      Object.assign(new Error('E11000'), { code: 11000, writeErrors: [{ code: 11000 }] })
    );
    const result = await cleanupAuditLogs();
    expect(mocks.auditDeleteMany).toHaveBeenCalledWith({ tenantId: 't1', _id: { $in: ['a1', 'a2'] } });
    expect(result.failed).toBe(0);
    expect(result.processed).toBe(2);
  });

  it('defaults to a 90-day live window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-31T00:00:00Z'));
    try {
      mocks.archivedInsertMany.mockResolvedValue([]);
      await cleanupAuditLogs();
      const filter = mocks.auditFind.mock.calls[0][0];
      const expected = new Date('2026-10-31T00:00:00Z');
      expected.setDate(expected.getDate() - 90);
      expect(filter.createdAt.$lt).toEqual(expected);
    } finally {
      vi.useRealTimers();
    }
  });

  it('drains full batches until a short batch', async () => {
    const full = [logs[0], logs[1]];
    mocks.auditFind
      .mockReturnValueOnce({ limit: () => ({ lean: vi.fn().mockResolvedValue(full) }) })
      .mockReturnValueOnce({ limit: () => ({ lean: vi.fn().mockResolvedValue([logs[0]]) }) });
    mocks.archivedInsertMany.mockResolvedValue([]);
    mocks.auditDeleteMany
      .mockResolvedValueOnce({ deletedCount: 2 })
      .mockResolvedValueOnce({ deletedCount: 1 });

    const result = await cleanupAuditLogs({ batchSize: 2 });
    expect(mocks.auditFind).toHaveBeenCalledTimes(2);
    expect(result.processed).toBe(3);
  });

  it('does not delete originals on other insert errors', async () => {
    mocks.archivedInsertMany.mockRejectedValue(
      Object.assign(new Error('boom'), { writeErrors: [{ code: 11000 }, { code: 2 }] })
    );
    const result = await cleanupAuditLogs();
    expect(mocks.auditDeleteMany).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
  });
});
