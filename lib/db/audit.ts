/**
 * Domain 8 (audit): tenant audit logs with their cold archive, the super-admin
 * action log, uploaded file records and long-term data archiving.
 *
 * `tenantId: null` means every tenant, for the super-admin views and the
 * retention job only.
 */
import type { Id, Ref, UserSummary } from './types';

type DateRange = { gt?: Date; gte?: Date; lt?: Date; lte?: Date };

type Page = { skip: number; limit: number };

// ─── Audit logs ─────────────────────────────────────────────────────────────

export interface AuditLog {
  _id: Id;
  tenantId: Id;
  userId?: Id;
  action: string;
  entityType: string;
  /** Polymorphic: the id of any entityType. */
  entityId?: string;
  changes?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export type AuditLogInput = Pick<AuditLog, 'action' | 'entityType'> &
  Partial<Pick<AuditLog, 'userId' | 'entityId' | 'changes' | 'ipAddress' | 'userAgent' | 'metadata'>>;

export type AuditLogWithUser = Omit<AuditLog, 'userId'> & { userId?: Ref<UserSummary> };

/** Super-admin read: the tenant is `{ _id, slug, name }` as well. */
export type AuditLogWithRefs = Omit<AuditLogWithUser, 'tenantId'> & { tenantId: Ref<{ slug: string; name: string }> };

export interface AuditLogFilter {
  action?: string;
  /** Case-insensitive substring of the action (literal, no regex). */
  actionContains?: string;
  entityType?: string;
  userId?: Id;
  createdAt?: DateRange;
}

export interface AuditLogRepo {
  create(tenantId: Id, input: AuditLogInput): Promise<AuditLog>;
  /** Newest first. */
  listWithUser(tenantId: Id, filter: AuditLogFilter, opts: { page: Page }): Promise<AuditLogWithUser[]>;
  /** Newest first. */
  listWithRefs(tenantId: Id | null, filter: AuditLogFilter, opts: { page: Page }): Promise<AuditLogWithRefs[]>;
  count(tenantId: Id | null, filter?: AuditLogFilter): Promise<number>;
  /**
   * Oldest first, as an electronic journal expects. `includeArchived` adds the
   * logs the retention job already moved to the archive.
   */
  listForExport(
    tenantId: Id,
    createdAt: DateRange,
    opts: { includeArchived: boolean }
  ): Promise<AuditLogWithUser[]>;
  /** Which of `userIds` have any audit entry, since `since` when given. */
  activeUserIds(tenantId: Id, userIds: Id[], opts?: { since?: Date }): Promise<Id[]>;
  /** Failed logins since `since`, and how many of them came before `windowStart`. */
  failedLoginCounts(
    tenantId: Id,
    range: { since: Date; windowStart: Date }
  ): Promise<{ failedToday: number; failedBeforeWindow: number }>;
  /**
   * Retention: takes the oldest logs before `before`, up to `limit`, and
   * removes them from the live table, keeping a copy in the archive when
   * `archive` is set. Safe to retry: a log is never archived twice. `found`
   * below `limit` means nothing is left.
   */
  retireBatch(
    tenantId: Id | null,
    opts: { before: Date; limit: number; archive: boolean }
  ): Promise<{ found: number; removed: number }>;
}

// ─── Super-admin actions (platform-wide, not tenant-scoped) ─────────────────

export interface SuperAdminAction {
  _id: Id;
  adminUserId: Id;
  action: string;
  targetType?: string;
  /** Polymorphic: the id of any targetType. */
  targetId?: string;
  description?: string;
  changes?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export type SuperAdminActionInput = Omit<SuperAdminAction, '_id' | 'createdAt'>;

export type SuperAdminActionWithAdmin = Omit<SuperAdminAction, 'adminUserId'> & { adminUserId: Ref<UserSummary> };

export interface SuperAdminActionFilter {
  /** Case-insensitive substring of the action (literal, no regex). */
  actionContains?: string;
  targetType?: string;
  adminUserId?: Id;
  createdAt?: DateRange;
}

export interface SuperAdminActionRepo {
  create(input: SuperAdminActionInput): Promise<SuperAdminAction>;
  /** Newest first. */
  listWithAdmin(filter: SuperAdminActionFilter, opts: { page: Page }): Promise<SuperAdminActionWithAdmin[]>;
  count(filter?: SuperAdminActionFilter): Promise<number>;
}

// ─── Files ──────────────────────────────────────────────────────────────────

export interface StoredFile {
  _id: Id;
  tenantId: Id;
  /** Original name. */
  name: string;
  /** Cloudinary public id. */
  filename: string;
  /** Bytes. */
  size: number;
  type: string;
  url: string;
  uploadedBy: Id;
  uploadedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type StoredFileInput = Pick<StoredFile, 'name' | 'filename' | 'size' | 'type' | 'url' | 'uploadedBy'>;

export interface FileRepo {
  /** Newest upload first. */
  list(tenantId: Id, opts: { limit: number }): Promise<StoredFile[]>;
  findById(tenantId: Id, id: Id): Promise<StoredFile | null>;
  create(tenantId: Id, input: StoredFileInput): Promise<StoredFile>;
  delete(tenantId: Id, id: Id): Promise<void>;
}

// ─── Data archive ───────────────────────────────────────────────────────────

export interface DataArchiveRepo {
  /**
   * Moves up to `limit` of the tenant's rows created before `before` from
   * `collection` to its archive. Returns how many moved.
   */
  moveOlderThan(tenantId: Id, collection: string, opts: { before: Date; limit: number }): Promise<number>;
}

export interface AuditRepos {
  auditLogs: AuditLogRepo;
  superAdminActions: SuperAdminActionRepo;
  files: FileRepo;
  dataArchive: DataArchiveRepo;
}
