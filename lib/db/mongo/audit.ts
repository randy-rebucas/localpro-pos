/**
 * Mongo implementation of the audit repositories (lib/db/audit.ts). Audit
 * writes never run in a caller's transaction: a failed sale keeps its trail.
 */
import mongoose from 'mongoose';
import AuditLogModel from '@/models/AuditLog';
import ArchivedAuditLogModel from '@/models/ArchivedAuditLog';
import SuperAdminActionModel from '@/models/SuperAdminAction';
import FileModel from '@/models/File';
import '@/models/User'; // registers the schemas for populate()
import '@/models/Tenant';
import type * as A from '../audit';
import { escapeRegex, run } from './helpers';
import { toApi, toApiList, toApiOrNull } from './serialize';

const USER_FIELDS = 'name email';

function rangeQuery(range: { gt?: Date; gte?: Date; lt?: Date; lte?: Date }) {
  return Object.fromEntries(
    (['gt', 'gte', 'lt', 'lte'] as const).filter((k) => range[k] !== undefined).map((k) => [`$${k}`, range[k]])
  );
}

const containsQuery = (value: string) => ({ $regex: escapeRegex(value), $options: 'i' });

// ─── Audit logs ─────────────────────────────────────────────────────────────

function auditLogQuery(tenantId: string | null, f: A.AuditLogFilter = {}): Record<string, unknown> {
  const q: Record<string, unknown> = {};
  if (tenantId) q.tenantId = tenantId;
  if (f.actionContains) q.action = containsQuery(f.actionContains);
  else if (f.action) q.action = f.action;
  if (f.entityType) q.entityType = f.entityType;
  if (f.userId) q.userId = f.userId;
  if (f.createdAt) q.createdAt = rangeQuery(f.createdAt);
  return q;
}

const auditLogs: A.AuditLogRepo = {
  create: (tenantId, input) =>
    run(async () => toApi<A.AuditLog>(await AuditLogModel.create({ ...input, tenantId }))),

  listWithUser: (tenantId, filter, opts) =>
    run(async () =>
      toApiList<A.AuditLogWithUser>(
        await AuditLogModel.find(auditLogQuery(tenantId, filter))
          .populate('userId', USER_FIELDS)
          .sort({ createdAt: -1 })
          .skip(opts.page.skip)
          .limit(opts.page.limit)
          .lean()
      )
    ),

  listWithRefs: (tenantId, filter, opts) =>
    run(async () =>
      toApiList<A.AuditLogWithRefs>(
        await AuditLogModel.find(auditLogQuery(tenantId, filter))
          .populate('tenantId', 'slug name')
          .populate('userId', USER_FIELDS)
          .sort({ createdAt: -1 })
          .skip(opts.page.skip)
          .limit(opts.page.limit)
          .lean()
      )
    ),

  count: (tenantId, filter) => run(() => AuditLogModel.countDocuments(auditLogQuery(tenantId, filter))),

  listForExport: (tenantId, createdAt, opts) =>
    run(async () => {
      const query = auditLogQuery(tenantId, { createdAt });
      const [live, archived] = await Promise.all([
        AuditLogModel.find(query).populate('userId', USER_FIELDS).sort({ createdAt: 1 }).lean(),
        opts.includeArchived
          ? ArchivedAuditLogModel.find(query).populate('userId', USER_FIELDS).sort({ createdAt: 1 }).lean()
          : Promise.resolve([]),
      ]);
      return toApiList<A.AuditLogWithUser>(
        [...archived, ...live].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      );
    }),

  activeUserIds: (tenantId, userIds, opts = {}) =>
    run(async () => {
      const ids = await AuditLogModel.distinct('userId', {
        tenantId,
        userId: { $in: userIds },
        ...(opts.since && { createdAt: { $gte: opts.since } }),
      });
      return ids.map((id) => String(id));
    }),

  failedLoginCounts: (tenantId, { since, windowStart }) =>
    run(async () => {
      const [counts] = await AuditLogModel.aggregate<{ failedToday: number; failedBeforeWindow: number }>([
        {
          $match: {
            tenantId: new mongoose.Types.ObjectId(tenantId),
            action: 'login',
            'metadata.success': false,
            createdAt: { $gte: since },
          },
        },
        {
          $group: {
            _id: null,
            failedToday: { $sum: 1 },
            failedBeforeWindow: { $sum: { $cond: [{ $lt: ['$createdAt', windowStart] }, 1, 0] } },
          },
        },
      ]);
      return { failedToday: counts?.failedToday ?? 0, failedBeforeWindow: counts?.failedBeforeWindow ?? 0 };
    }),

  retireBatch: (tenantId, { before, limit, archive }) =>
    run(async () => {
      const ids = (
        await AuditLogModel.find(auditLogQuery(tenantId, { createdAt: { lt: before } }))
          .select('_id')
          .sort({ createdAt: 1 })
          .limit(limit)
          .lean()
      ).map((log) => log._id);
      if (ids.length === 0) return { found: 0, removed: 0 };

      if (archive) {
        // Copied server-side, keeping the original _id, so a retried batch
        // doesn't duplicate archive rows
        await AuditLogModel.aggregate([
          { $match: { _id: { $in: ids } } },
          { $set: { archivedAt: '$$NOW' } },
          {
            $merge: {
              into: ArchivedAuditLogModel.collection.collectionName,
              on: '_id',
              whenMatched: 'keepExisting',
              whenNotMatched: 'insert',
            },
          },
        ]);
      }

      const { deletedCount } = await AuditLogModel.deleteMany({ _id: { $in: ids } });
      return { found: ids.length, removed: deletedCount ?? 0 };
    }),
};

// ─── Super-admin actions ────────────────────────────────────────────────────

function superAdminActionQuery(f: A.SuperAdminActionFilter = {}): Record<string, unknown> {
  return {
    ...(f.actionContains && { action: containsQuery(f.actionContains) }),
    ...(f.targetType && { targetType: f.targetType }),
    ...(f.adminUserId && { adminUserId: f.adminUserId }),
    ...(f.createdAt && { createdAt: rangeQuery(f.createdAt) }),
  };
}

const superAdminActions: A.SuperAdminActionRepo = {
  create: (input) => run(async () => toApi<A.SuperAdminAction>(await SuperAdminActionModel.create(input))),

  listWithAdmin: (filter, opts) =>
    run(async () =>
      toApiList<A.SuperAdminActionWithAdmin>(
        await SuperAdminActionModel.find(superAdminActionQuery(filter))
          .populate('adminUserId', USER_FIELDS)
          .sort({ createdAt: -1 })
          .skip(opts.page.skip)
          .limit(opts.page.limit)
          .lean()
      )
    ),

  count: (filter) => run(() => SuperAdminActionModel.countDocuments(superAdminActionQuery(filter))),
};

// ─── Files ──────────────────────────────────────────────────────────────────

const files: A.FileRepo = {
  list: (tenantId, opts) =>
    run(async () =>
      toApiList<A.StoredFile>(
        await FileModel.find({ tenantId })
          .select('_id name filename size type url uploadedAt uploadedBy')
          .sort({ uploadedAt: -1 })
          .limit(opts.limit)
          .lean()
      )
    ),

  findById: (tenantId, id) =>
    run(async () => toApiOrNull<A.StoredFile>(await FileModel.findOne({ _id: id, tenantId }).lean())),

  create: (tenantId, input) =>
    run(async () => toApi<A.StoredFile>(await FileModel.create({ ...input, tenantId }))),

  delete: (tenantId, id) =>
    run(async () => {
      await FileModel.deleteOne({ _id: id, tenantId });
    }),
};

// ─── Data archive ───────────────────────────────────────────────────────────

const dataArchive: A.DataArchiveRepo = {
  moveOlderThan: (tenantId, collectionName, { before, limit }) =>
    run(async () => {
      const db = mongoose.connection.db;
      if (!db) return 0;

      const collection = db.collection(collectionName);
      const oldDocuments = await collection
        .find({ tenantId: new mongoose.Types.ObjectId(tenantId), createdAt: { $lt: before } })
        .limit(limit)
        .toArray();
      if (oldDocuments.length === 0) return 0;

      await db.collection(`${collectionName}_archive`).insertMany(
        oldDocuments.map((doc) => ({ ...doc, archivedAt: new Date(), originalCollection: collectionName }))
      );
      await collection.deleteMany({ _id: { $in: oldDocuments.map((doc) => doc._id) } });
      return oldDocuments.length;
    }),
};

export const mongoAuditRepos: A.AuditRepos = { auditLogs, superAdminActions, files, dataArchive };
