/**
 * Mongo audit repositories: tenant scoping, `null` meaning every tenant,
 * literal action search, and the retention batch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

import mongoose from 'mongoose';
import AuditLogModel from '@/models/AuditLog';
import ArchivedAuditLogModel from '@/models/ArchivedAuditLog';
import SuperAdminActionModel from '@/models/SuperAdminAction';
import FileModel from '@/models/File';
import { mongoAuditRepos as repos } from '@/lib/db/mongo/audit';

const TENANT = '64abc123def4567890abcdef';
const ID = '64abc123def4567890abc000';
const USER = '64abc123def4567890abc111';
const now = new Date('2026-11-01T00:00:00Z');
const page = { skip: 0, limit: 10 };

function leanQuery(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'populate', 'sort', 'skip', 'limit']) q[m] = vi.fn(() => q);
  q.lean = vi.fn().mockResolvedValue(result);
  return q;
}

const lastArgs = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls[spy.mock.calls.length - 1];

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('audit logs', () => {
  it('scopes every tenant read', async () => {
    const find = vi.spyOn(AuditLogModel, 'find').mockReturnValue(leanQuery([]) as never);
    const count = vi.spyOn(AuditLogModel, 'countDocuments').mockResolvedValue(0 as never);
    const distinct = vi.spyOn(AuditLogModel, 'distinct').mockResolvedValue([] as never);
    const archived = vi.spyOn(ArchivedAuditLogModel, 'find').mockReturnValue(leanQuery([]) as never);

    await repos.auditLogs.listWithUser(TENANT, {}, { page });
    await repos.auditLogs.listWithRefs(TENANT, {}, { page });
    await repos.auditLogs.listForExport(TENANT, { gte: now }, { includeArchived: true });
    await repos.auditLogs.count(TENANT);
    await repos.auditLogs.activeUserIds(TENANT, [USER]);

    for (const spy of [find, count, distinct, archived]) {
      expect(spy).toHaveBeenCalled();
      for (const call of spy.mock.calls) expect(call[call.length - 1]).toMatchObject({ tenantId: TENANT });
    }
  });

  it('a create cannot be redirected to another tenant by the input', async () => {
    const create = vi.spyOn(AuditLogModel, 'create').mockResolvedValue({ _id: ID } as never);

    await repos.auditLogs.create(TENANT, { action: 'x', entityType: 'y', tenantId: 'other' } as never);

    expect(create.mock.calls[0][0]).toMatchObject({ tenantId: TENANT });
  });

  it('null reads every tenant', async () => {
    const find = vi.spyOn(AuditLogModel, 'find').mockReturnValue(leanQuery([]) as never);
    const count = vi.spyOn(AuditLogModel, 'countDocuments').mockResolvedValue(0 as never);

    await repos.auditLogs.listWithRefs(null, { entityType: 'user' }, { page });
    await repos.auditLogs.count(null, { entityType: 'user' });

    expect(lastArgs(find)[0]).toEqual({ entityType: 'user' });
    expect(lastArgs(count)[0]).toEqual({ entityType: 'user' });
  });

  it('matches the action search literally', async () => {
    const count = vi.spyOn(AuditLogModel, 'countDocuments').mockResolvedValue(0 as never);

    await repos.auditLogs.count(null, { actionContains: 'stock.(' });

    expect(lastArgs(count)[0]).toEqual({ action: { $regex: 'stock\\.\\(', $options: 'i' } });
  });

  it('skips the archive unless asked', async () => {
    vi.spyOn(AuditLogModel, 'find').mockReturnValue(leanQuery([]) as never);
    const archived = vi.spyOn(ArchivedAuditLogModel, 'find').mockReturnValue(leanQuery([]) as never);

    await repos.auditLogs.listForExport(TENANT, { gte: now }, { includeArchived: false });

    expect(archived).not.toHaveBeenCalled();
  });

  it('merges the archive and live logs oldest first', async () => {
    const at = (day: number) => new Date(Date.UTC(2026, 0, day));
    vi.spyOn(AuditLogModel, 'find').mockReturnValue(leanQuery([{ action: 'live', createdAt: at(2) }]) as never);
    vi.spyOn(ArchivedAuditLogModel, 'find').mockReturnValue(
      leanQuery([
        { action: 'old', createdAt: at(1) },
        { action: 'late', createdAt: at(3) },
      ]) as never
    );

    const logs = await repos.auditLogs.listForExport(TENANT, { gte: now }, { includeArchived: true });

    expect(logs.map((l) => l.action)).toEqual(['old', 'live', 'late']);
  });

  it('activeUserIds limits by date only when given, and returns strings', async () => {
    const oid = new mongoose.Types.ObjectId(USER);
    const distinct = vi.spyOn(AuditLogModel, 'distinct').mockResolvedValue([oid] as never);

    await expect(repos.auditLogs.activeUserIds(TENANT, [USER], { since: now })).resolves.toEqual([USER]);
    expect(lastArgs(distinct)[1]).toEqual({ tenantId: TENANT, userId: { $in: [USER] }, createdAt: { $gte: now } });

    await repos.auditLogs.activeUserIds(TENANT, [USER]);
    expect(lastArgs(distinct)[1]).toEqual({ tenantId: TENANT, userId: { $in: [USER] } });
  });

  it('failedLoginCounts casts the tenant id, which aggregates do not do', async () => {
    const aggregate = vi
      .spyOn(AuditLogModel, 'aggregate')
      .mockResolvedValue([{ failedToday: 7, failedBeforeWindow: 6 }] as never);

    const counts = await repos.auditLogs.failedLoginCounts(TENANT, { since: now, windowStart: now });

    expect(counts).toEqual({ failedToday: 7, failedBeforeWindow: 6 });
    const [match] = lastArgs(aggregate)[0] as Array<{ $match: { tenantId: unknown } }>;
    expect(match.$match.tenantId).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(String(match.$match.tenantId)).toBe(TENANT);
  });

  it('failedLoginCounts is zero without failures', async () => {
    vi.spyOn(AuditLogModel, 'aggregate').mockResolvedValue([] as never);

    await expect(repos.auditLogs.failedLoginCounts(TENANT, { since: now, windowStart: now })).resolves.toEqual({
      failedToday: 0,
      failedBeforeWindow: 0,
    });
  });
});

describe('retireBatch', () => {
  const ids = [new mongoose.Types.ObjectId(ID)];

  function spies() {
    return {
      find: vi.spyOn(AuditLogModel, 'find').mockReturnValue(leanQuery(ids.map((_id) => ({ _id }))) as never),
      aggregate: vi.spyOn(AuditLogModel, 'aggregate').mockResolvedValue([] as never),
      remove: vi.spyOn(AuditLogModel, 'deleteMany').mockResolvedValue({ deletedCount: 1 } as never),
    };
  }

  it('copies to the archive before deleting, and a retry cannot duplicate', async () => {
    const { aggregate, remove } = spies();

    const result = await repos.auditLogs.retireBatch(null, { before: now, limit: 10, archive: true });

    expect(result).toEqual({ found: 1, removed: 1 });
    const pipeline = lastArgs(aggregate)[0] as Array<Record<string, { whenMatched?: string; on?: string }>>;
    expect(pipeline[2].$merge).toMatchObject({ on: '_id', whenMatched: 'keepExisting' });
    expect(aggregate.mock.invocationCallOrder[0]).toBeLessThan(remove.mock.invocationCallOrder[0]);
  });

  it('deletes without copying when archiving is off', async () => {
    const { aggregate, remove } = spies();

    await repos.auditLogs.retireBatch(null, { before: now, limit: 10, archive: false });

    expect(aggregate).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalled();
  });

  it('keeps a failed copy from deleting anything', async () => {
    const { aggregate, remove } = spies();
    aggregate.mockRejectedValue(new Error('merge failed') as never);

    await expect(repos.auditLogs.retireBatch(null, { before: now, limit: 10, archive: true })).rejects.toThrow('merge failed');

    expect(remove).not.toHaveBeenCalled();
  });

  it('filters by tenant when one is given', async () => {
    const { find } = spies();

    await repos.auditLogs.retireBatch(TENANT, { before: now, limit: 10, archive: true });

    expect(lastArgs(find)[0]).toEqual({ tenantId: TENANT, createdAt: { $lt: now } });
  });

  it('does nothing when no log is old enough', async () => {
    vi.spyOn(AuditLogModel, 'find').mockReturnValue(leanQuery([]) as never);
    const remove = vi.spyOn(AuditLogModel, 'deleteMany');

    await expect(repos.auditLogs.retireBatch(null, { before: now, limit: 10, archive: true })).resolves.toEqual({
      found: 0,
      removed: 0,
    });
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('super-admin actions', () => {
  it('translates the filter', async () => {
    const count = vi.spyOn(SuperAdminActionModel, 'countDocuments').mockResolvedValue(0 as never);

    await repos.superAdminActions.count({
      actionContains: 'imp',
      targetType: 'User',
      adminUserId: USER,
      createdAt: { gte: now },
    });

    expect(lastArgs(count)[0]).toEqual({
      action: { $regex: 'imp', $options: 'i' },
      targetType: 'User',
      adminUserId: USER,
      createdAt: { $gte: now },
    });
  });
});

describe('files', () => {
  it('scopes reads and deletes by tenant', async () => {
    const find = vi.spyOn(FileModel, 'find').mockReturnValue(leanQuery([]) as never);
    const findOne = vi.spyOn(FileModel, 'findOne').mockReturnValue(leanQuery(null) as never);
    const remove = vi.spyOn(FileModel, 'deleteOne').mockResolvedValue({} as never);

    await repos.files.list(TENANT, { limit: 100 });
    await repos.files.findById(TENANT, ID);
    await repos.files.delete(TENANT, ID);

    expect(lastArgs(find)[0]).toEqual({ tenantId: TENANT });
    expect(lastArgs(findOne)[0]).toEqual({ _id: ID, tenantId: TENANT });
    expect(lastArgs(remove)[0]).toEqual({ _id: ID, tenantId: TENANT });
  });

  it('a create cannot be redirected to another tenant by the input', async () => {
    const create = vi.spyOn(FileModel, 'create').mockResolvedValue({ _id: ID } as never);

    await repos.files.create(TENANT, { name: 'a', tenantId: 'other' } as never);

    expect(create.mock.calls[0][0]).toMatchObject({ tenantId: TENANT });
  });
});

describe('data archive', () => {
  function fakeDb(rows: unknown[]) {
    const source = {
      find: vi.fn(() => ({ limit: () => ({ toArray: vi.fn().mockResolvedValue(rows) }) })),
      deleteMany: vi.fn().mockResolvedValue({}),
    };
    const archive = { insertMany: vi.fn().mockResolvedValue({}) };
    const db = { collection: (name: string) => (name.endsWith('_archive') ? archive : source) };
    (mongoose.connection as unknown as { db: unknown }).db = db;
    return { source, archive };
  }

  it('moves the rows of one tenant, copying before it deletes', async () => {
    const { source, archive } = fakeDb([{ _id: ID }]);

    await expect(repos.dataArchive.moveOlderThan(TENANT, 'transactions', { before: now, limit: 1000 })).resolves.toBe(1);

    const [filter] = source.find.mock.calls[0] as unknown as [{ tenantId: unknown; createdAt: unknown }];
    expect(String(filter.tenantId)).toBe(TENANT);
    expect(filter.createdAt).toEqual({ $lt: now });
    expect(archive.insertMany.mock.calls[0][0][0]).toMatchObject({ _id: ID, originalCollection: 'transactions' });
    expect(archive.insertMany.mock.invocationCallOrder[0]).toBeLessThan(source.deleteMany.mock.invocationCallOrder[0]);
  });

  it('touches nothing when no row is old enough', async () => {
    const { source, archive } = fakeDb([]);

    await expect(repos.dataArchive.moveOlderThan(TENANT, 'transactions', { before: now, limit: 1000 })).resolves.toBe(0);

    expect(archive.insertMany).not.toHaveBeenCalled();
    expect(source.deleteMany).not.toHaveBeenCalled();
  });
});
