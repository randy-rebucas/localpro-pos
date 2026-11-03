/**
 * Audit & security domain: tenant audit logs (+ cold archive), super-admin
 * action log, uploaded files, and JWT revocation stores.
 */
import { bigint, index, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { id, objectId, tenantId, timestamps, timestamptz } from './_columns';
import { users } from './core';

// models/AuditLog.ts
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    tenantId: tenantId(),
    userId: objectId('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    // Polymorphic (id of any entity_type) → text, no FK
    entityId: text('entity_id'),
    changes: jsonb('changes').$type<Record<string, unknown>>(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    ...timestamps(),
  },
  t => [
    index('audit_logs_tenant_created_at_idx').on(t.tenantId, t.createdAt.desc()),
    index('audit_logs_tenant_user_created_at_idx').on(t.tenantId, t.userId, t.createdAt.desc()),
    index('audit_logs_tenant_entity_idx').on(t.tenantId, t.entityType, t.entityId),
    // Cross-tenant scans + the 90-day archive job (lib/automations/audit-log-cleanup.ts)
    index('audit_logs_created_at_idx').on(t.createdAt),
  ]
);

// models/ArchivedAuditLog.ts
export const archivedAuditLogs = pgTable(
  'archived_audit_logs',
  {
    id: id(),
    tenantId: tenantId(),
    userId: objectId('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    // Polymorphic (id of any entity_type) → text, no FK
    entityId: text('entity_id'),
    changes: jsonb('changes').$type<Record<string, unknown>>(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    archivedAt: timestamptz('archived_at').notNull().defaultNow(),
    // Copied from the original audit log — no default on purpose
    createdAt: timestamptz('created_at').notNull(),
  },
  t => [index('archived_audit_logs_tenant_created_at_idx').on(t.tenantId, t.createdAt.desc())]
);

// models/SuperAdminAction.ts
export const superAdminActions = pgTable(
  'super_admin_actions',
  {
    id: id(),
    adminUserId: objectId('admin_user_id')
      .notNull()
      .references(() => users.id),
    action: text('action').notNull(),
    targetType: text('target_type'),
    // Polymorphic (id of any target_type) → text, no FK
    targetId: text('target_id'),
    description: text('description'),
    changes: jsonb('changes').$type<Record<string, unknown>>(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    // timestamps: { createdAt: true, updatedAt: false }
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  t => [
    index('super_admin_actions_action_idx').on(t.action),
    index('super_admin_actions_admin_created_at_idx').on(t.adminUserId, t.createdAt.desc()),
    index('super_admin_actions_created_at_idx').on(t.createdAt.desc()),
    index('super_admin_actions_target_idx').on(t.targetType, t.targetId),
  ]
);

// models/File.ts
export const files = pgTable(
  'files',
  {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    filename: text('filename').notNull(),
    // Bytes; bigint so >2 GiB uploads cannot overflow
    size: bigint('size', { mode: 'number' }).notNull(),
    type: text('type').notNull(),
    url: text('url').notNull(),
    uploadedBy: objectId('uploaded_by')
      .notNull()
      .references(() => users.id),
    uploadedAt: timestamptz('uploaded_at').notNull().defaultNow(),
    ...timestamps(),
  },
  t => [index('files_tenant_uploaded_at_idx').on(t.tenantId, t.uploadedAt.desc())]
);

// lib/token-blacklist.ts — RevokedToken
export const revokedTokens = pgTable(
  'revoked_tokens',
  {
    id: id(),
    // Truncated SHA-256 of the JWT
    tokenHash: text('token_hash').notNull(),
    reason: text('reason').notNull().default('logout'),
    expiresAt: timestamptz('expires_at').notNull(),
  },
  t => [
    uniqueIndex('revoked_tokens_token_hash_key').on(t.tokenHash),
    // TTL in Mongo — enforced by lib/automations/ttl-cleanup.ts
    index('revoked_tokens_expires_at_idx').on(t.expiresAt),
  ]
);

// lib/token-blacklist.ts — UserRevocation
export const userRevocations = pgTable(
  'user_revocations',
  {
    id: id(),
    // String in Mongo (JWT subject, may be a customer or super-admin id) → text, no FK
    userId: text('user_id').notNull(),
    revokedBefore: timestamptz('revoked_before').notNull(),
  },
  t => [uniqueIndex('user_revocations_user_id_key').on(t.userId)]
);
