/**
 * Automated Database Backups
 * Scheduled automatic backups with optional S3 cloud upload
 */

import { AutomationResult } from './types';

// Lazy-load Node.js modules to prevent Turbopack from tracing the entire project.
// These are only used at runtime when backups are triggered, not at bundle time.
/* turbopackIgnore: true */
const _importFs = () => import('fs/promises');
/* turbopackIgnore: true */
const _importPath = () => import('path');
/* turbopackIgnore: true */
const _importChildProcess = () => import('child_process');

/**
 * Build a pg_dump/pg_restore/psql-compatible connection string from the same
 * DATABASE_URL env var lib/db.ts's Prisma client uses (see prisma/schema.prisma's
 * datasource block: `url = env("DATABASE_URL")`).
 */
function getPostgresConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set; cannot connect to Postgres for backup/restore');
  }
  return url;
}

export interface DatabaseBackupOptions {
  tenantId?: string; // If specified, backup only this tenant's data
  backupPath?: string; // Local backup path
  uploadToCloud?: boolean; // Upload to cloud storage (S3-compatible)
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
    const { execFile } = await _importChildProcess();
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);

    const backupDir = options.backupPath || path.join(/*turbopackIgnore: true*/ process.cwd(), 'backups');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    // pg_dump custom format (-Fc): compressed, and restorable selectively with pg_restore.
    const backupFileName = `backup-${timestamp}.dump`;
    const backupFilePath = path.join(backupDir, backupFileName);

    // Ensure backup directory exists
    try {
      await fs.mkdir(backupDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    const connectionString = getPostgresConnectionString();

    if (options.tenantId) {
      // pg_dump dumps whole tables/schemas, not row-filtered data — it has no
      // equivalent of the old Mongo per-tenant `find({ tenantId })` export.
      // Row-level, tenant-scoped exports would need per-table `COPY ... WHERE`
      // (or a Prisma-driven JSON export); that's out of scope here, so a
      // tenantId-scoped request still produces a full-database dump and we
      // surface that clearly instead of silently ignoring the option.
      results.errors?.push(
        'tenantId option is not supported by pg_dump (table-level tool, no row filtering); produced a full-database backup instead.'
      );
    }

    // mongodump -> pg_dump: full logical backup in custom (compressed, restorable) format.
    //   mongodump --uri="<mongo uri>" --archive=<file> --gzip
    //   pg_dump "<postgres connection string>" -Fc -f <file>
    await execFileAsync('pg_dump', [connectionString, '-Fc', '-f', backupFilePath]);

    // Rotate old backups (keep last 7)
    try {
      const files = await fs.readdir(backupDir);
      const oldBackups = files
        .filter(f => f.startsWith('backup-') && f.endsWith('.dump'))
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
  backupFilePath: string; // Absolute path to a pg_dump custom-format (-Fc) .dump file
  clearExisting?: boolean; // Pass --clean to pg_restore (drop objects before recreating)
  dryRun?: boolean; // List the dump's contents without writing to the database
}

export interface DatabaseRestoreResult {
  success: boolean;
  message: string;
  dryRun: boolean;
  errors: string[];
}

/**
 * Restore the Postgres database from a pg_dump custom-format backup file
 * produced by createDatabaseBackup. Note: unlike the old Mongo per-collection
 * JSON restore, pg_restore operates on the whole dump — there is no
 * collection-level filtering equivalent.
 */
export async function restoreDatabaseBackup(
  options: DatabaseRestoreOptions
): Promise<DatabaseRestoreResult> {
  const result: DatabaseRestoreResult = {
    success: true,
    message: '',
    dryRun: options.dryRun ?? false,
    errors: [],
  };

  try {
    const { execFile } = await _importChildProcess();
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);

    const connectionString = getPostgresConnectionString();

    if (options.dryRun) {
      const { stdout } = await execFileAsync('pg_restore', ['--list', options.backupFilePath]);
      const entryCount = stdout.split('\n').filter((l) => l.trim().length > 0).length;
      result.message = `[DRY RUN] Backup contains ${entryCount} entries; no changes made`;
      return result;
    }

    const args = [
      options.backupFilePath,
      '-d', connectionString,
      '--no-owner',
      '--no-privileges',
    ];
    if (options.clearExisting) {
      args.push('--clean', '--if-exists');
    }

    await execFileAsync('pg_restore', args);
    result.message = 'Database restored successfully';
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
