/**
 * Automated Database Backups
 * Scheduled automatic backups with optional S3 cloud upload
 *
 * Postgres port note: the original Mongo implementation dumped every
 * collection via the driver's raw `db.listCollections()`. Prisma has no
 * equivalent "list all tables and read them generically" API, so this
 * enumerates the app's Prisma models explicitly (kept in sync with
 * prisma/schema.prisma) and reads each via `prisma.<model>.findMany()`.
 * The on-disk format is preserved: a single JSON file of
 * `{ [modelName]: record[] }`, written to the same `backups/` directory
 * consumed by app/api/super-admin/backups/* and
 * app/api/automations/backups/create. `modelName` is now the Prisma
 * client's camelCase accessor (e.g. `offlineTransaction`) rather than the
 * old Mongo collection name — restore only relies on these names being
 * self-consistent between backup and restore, not on any external format.
 */

import prisma from '@/lib/prisma';
import { AutomationResult } from './types';

// Lazy-load Node.js modules to prevent Turbopack from tracing the entire project.
// These are only used at runtime when backups are triggered, not at bundle time.
/* turbopackIgnore: true */
const _importFs = () => import('fs/promises');
/* turbopackIgnore: true */
const _importPath = () => import('path');

export interface DatabaseBackupOptions {
  tenantId?: string; // If specified, backup only this tenant's data
  backupPath?: string; // Local backup path
  uploadToCloud?: boolean; // Upload to cloud storage (S3-compatible)
}

// Prisma model accessor name -> whether it has a tenantId column (for
// per-tenant backup filtering). Kept in sync with prisma/schema.prisma.
// System/audit trail tables (RevokedToken, UserRevocation, SuperAdminAction,
// Counter, MigrationIdMap) are intentionally excluded — not tenant business
// data, not useful/safe to restore blindly.
const TENANT_SCOPED_MODELS = [
  'taxRule', 'featureFlagOverride', 'address', 'file', 'user', 'branch',
  'device', 'table', 'auditLog', 'archivedAuditLog', 'category', 'product',
  'productBundle', 'productChannelListing', 'discount', 'loyaltyConfig',
  'campaign', 'tenantEcommerceIntegration', 'customer', 'customerOTP',
  'customerBalancePayment', 'booking', 'recurringBookingTemplate',
  'prescription', 'savedCart', 'cashDrawerSession', 'transaction', 'payment',
  'invoice', 'stockMovement', 'expense', 'offlineTransaction', 'zReading',
  'loyaltyTransaction', 'billingEvent', 'subscription', 'attendance',
] as const;

// Non-tenant-scoped models (or joined via a tenant-scoped parent) that are
// still part of a full (non-per-tenant) backup.
const GLOBAL_MODELS = [
  'tenant', 'subscriptionPlan', 'coupon', 'productBranchStock',
  'productBundleItem', 'prescriptionItem', 'transactionItem',
  'transactionSplitPayment', 'subscriptionBillingHistoryEntry', 'posSession',
] as const;

type PrismaDelegate = {
  findMany: (args?: any) => Promise<any[]>; // eslint-disable-line @typescript-eslint/no-explicit-any
  deleteMany: (args?: any) => Promise<{ count: number }>; // eslint-disable-line @typescript-eslint/no-explicit-any
  createMany: (args: any) => Promise<{ count: number }>; // eslint-disable-line @typescript-eslint/no-explicit-any
};

function getDelegate(modelName: string): PrismaDelegate {
  return (prisma as unknown as Record<string, PrismaDelegate>)[modelName];
}

/**
 * Create database backup
 */
export async function createDatabaseBackup(
  options: DatabaseBackupOptions = {}
): Promise<AutomationResult> {
  const results: AutomationResult = {
    success: true,
    message: '',
    processed: 0,
    failed: 0,
    errors: [],
  };

  try {
    const fs = await _importFs();
    const path = await _importPath();

    const backupDir = options.backupPath || path.join(/*turbopackIgnore: true*/ process.cwd(), 'backups');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `backup-${timestamp}.json`;
    const backupFilePath = path.join(backupDir, backupFileName);

    // Ensure backup directory exists
    try {
      await fs.mkdir(backupDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    const backupData: Record<string, any[]> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any

    if (options.tenantId) {
      // Per-tenant backup: only tenant-scoped models, filtered by tenantId,
      // plus the Tenant row itself.
      const tenant = await getDelegate('tenant').findMany({ where: { id: options.tenantId } });
      if (tenant.length > 0) backupData['tenant'] = tenant;

      for (const modelName of TENANT_SCOPED_MODELS) {
        try {
          const docs = await getDelegate(modelName).findMany({ where: { tenantId: options.tenantId }, take: 10000 });
          if (docs.length > 0) backupData[modelName] = docs;
        } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
          results.errors?.push(`Model ${modelName}: ${err.message}`);
        }
      }
    } else {
      // Full backup: every known model, limited to prevent memory issues.
      for (const modelName of [...TENANT_SCOPED_MODELS, ...GLOBAL_MODELS]) {
        try {
          const docs = await getDelegate(modelName).findMany({ take: 10000 });
          if (docs.length > 0) backupData[modelName] = docs;
        } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
          results.errors?.push(`Model ${modelName}: ${err.message}`);
        }
      }
    }

    // Write backup to file (Decimal/Date instances -> JSON via toString/ISO)
    await fs.writeFile(backupFilePath, JSON.stringify(backupData, null, 2), 'utf-8');

    // Rotate old backups (keep last 7)
    try {
      const files = await fs.readdir(backupDir);
      const oldBackups = files
        .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
        .sort()
        .reverse();

      // Keep only last 7 backups
      if (oldBackups.length > 7) {
        for (const file of oldBackups.slice(7)) {
          await fs.unlink(path.join(backupDir, file)).catch(() => {
            // Ignore errors
          });
        }
      }
    } catch (error) {
      // Ignore rotation errors
    }

    results.processed = 1;
    results.message = `Backup created: ${backupFileName}`;

    // Upload to S3-compatible cloud storage if enabled
    if (options.uploadToCloud) {
      try {
        await uploadBackupToS3(backupFilePath, backupFileName, options.tenantId);
        results.message += ` | Uploaded to cloud storage`;
      } catch (uploadError: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        results.errors?.push(`Cloud upload failed: ${uploadError.message}`);
        // Don't fail the whole backup if cloud upload fails — local backup is still valid
      }
    }

    return results;
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    results.success = false;
    results.message = `Error creating backup: ${error.message}`;
    results.errors?.push(error.message);
    results.failed = 1;
    return results;
  }
}

export interface DatabaseRestoreOptions {
  backupFilePath: string; // Absolute path to the JSON backup file
  clearExisting?: boolean; // Delete each model's rows before inserting (default: false)
  collections?: string[]; // Restore only these models (by Prisma accessor name); omit to restore all
  dryRun?: boolean; // Parse and count without writing to the database
}

export interface RestoreCollectionResult {
  inserted: number;
  cleared: number;
  skipped?: boolean;
}

export interface DatabaseRestoreResult {
  success: boolean;
  message: string;
  dryRun: boolean;
  collections: Record<string, RestoreCollectionResult>;
  errors: string[];
}

// Restore order matters for FK integrity: parents before children.
// Anything not listed here is restored last, in file order.
const RESTORE_ORDER = [
  'tenant', 'user', 'branch', 'device', 'table', 'category', 'product',
  'productBranchStock', 'productBundle', 'productBundleItem',
  'productChannelListing', 'discount', 'coupon', 'loyaltyConfig', 'campaign',
  'customer', 'customerOTP', 'customerBalancePayment', 'booking',
  'recurringBookingTemplate', 'prescription', 'prescriptionItem',
  'savedCart', 'cashDrawerSession', 'transaction', 'transactionItem',
  'transactionSplitPayment', 'payment', 'invoice', 'stockMovement',
  'expense', 'offlineTransaction', 'zReading', 'loyaltyTransaction',
  'billingEvent', 'subscription', 'subscriptionBillingHistoryEntry',
  'attendance', 'taxRule', 'featureFlagOverride', 'address', 'file',
  'auditLog', 'archivedAuditLog', 'tenantEcommerceIntegration',
  'subscriptionPlan', 'posSession',
];

/**
 * Restore database from a JSON backup file produced by createDatabaseBackup.
 * `collectionsMap` keys are Prisma model accessor names (e.g. `product`,
 * `offlineTransaction`), matching what createDatabaseBackup wrote.
 */
export async function restoreDatabaseBackup(
  options: DatabaseRestoreOptions
): Promise<DatabaseRestoreResult> {
  const result: DatabaseRestoreResult = {
    success: true,
    message: '',
    dryRun: options.dryRun ?? false,
    collections: {},
    errors: [],
  };

  try {
    const fs = await _importFs();
    const raw = await fs.readFile(options.backupFilePath, 'utf-8');
    const backupData = JSON.parse(raw);

    // Support both formats: flat { modelName: [...] } and wrapped { collections: { ... } }
    const collectionsMap: Record<string, unknown[]> =
      backupData.collections ?? backupData;

    const requested = options.collections
      ? options.collections
      : Object.keys(collectionsMap);

    // Order requested models by RESTORE_ORDER (parents first), unknowns last.
    const targetModels = [...requested].sort((a, b) => {
      const ia = RESTORE_ORDER.indexOf(a);
      const ib = RESTORE_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    for (const modelName of targetModels) {
      const docs = collectionsMap[modelName];
      if (!Array.isArray(docs)) {
        result.collections[modelName] = { inserted: 0, cleared: 0, skipped: true };
        continue;
      }

      let delegate: PrismaDelegate;
      try {
        delegate = getDelegate(modelName);
        if (!delegate || typeof delegate.findMany !== 'function') {
          throw new Error(`Unknown model "${modelName}"`);
        }
      } catch (err: unknown) {
        result.collections[modelName] = { inserted: 0, cleared: 0, skipped: true };
        result.errors.push(`${modelName}: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }

      if (options.dryRun) {
        result.collections[modelName] = { inserted: docs.length, cleared: 0 };
        continue;
      }

      let cleared = 0;
      if (options.clearExisting) {
        try {
          const del = await delegate.deleteMany({});
          cleared = del.count ?? 0;
        } catch (err: unknown) {
          result.errors.push(`${modelName} clear: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      let inserted = 0;
      if (docs.length > 0) {
        // Insert in chunks; skipDuplicates so re-running a restore is idempotent.
        const CHUNK = 500;
        for (let i = 0; i < docs.length; i += CHUNK) {
          try {
            const res = await delegate.createMany({
              data: docs.slice(i, i + CHUNK),
              skipDuplicates: true,
            });
            inserted += res.count ?? 0;
          } catch (err: unknown) {
            result.errors.push(`${modelName} chunk ${i / CHUNK + 1}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }

      result.collections[modelName] = { inserted, cleared };
    }

    const totalInserted = Object.values(result.collections).reduce((s, c) => s + c.inserted, 0);
    const prefix = options.dryRun ? '[DRY RUN] Would restore' : 'Restored';
    result.message = `${prefix} ${totalInserted} record(s) across ${Object.keys(result.collections).length} model(s)`;

    return result;
  } catch (err: unknown) {
    result.success = false;
    result.message = `Restore failed: ${err instanceof Error ? err.message : String(err)}`;
    result.errors.push(result.message);
    return result;
  }
}

/**
 * Upload backup file to S3-compatible storage
 * Requires env vars: BACKUP_S3_BUCKET, BACKUP_S3_REGION, BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY
 * Optional: BACKUP_S3_ENDPOINT (for DigitalOcean Spaces, MinIO, etc.)
 */
async function uploadBackupToS3(
  filePath: string,
  fileName: string,
  tenantId?: string
): Promise<void> {
  const bucket = process.env.BACKUP_S3_BUCKET;
  const region = process.env.BACKUP_S3_REGION || 'ap-southeast-1';
  const accessKeyId = process.env.BACKUP_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.BACKUP_S3_SECRET_ACCESS_KEY;
  const endpoint = process.env.BACKUP_S3_ENDPOINT; // Optional: for S3-compatible services

  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('Missing S3 configuration. Set BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY_ID, and BACKUP_S3_SECRET_ACCESS_KEY env vars.');
  }

  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');

  const client = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
  });

  const fs = await _importFs();
  const fileContent = await fs.readFile(filePath);
  const key = tenantId
    ? `backups/${tenantId}/${fileName}`
    : `backups/full/${fileName}`;

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: fileContent,
    ContentType: 'application/json',
  }));
}
