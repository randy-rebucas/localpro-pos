/**
 * Automated Database Backups
 * Scheduled automatic backups with optional S3 cloud upload
 */

import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
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

/**
 * Create database backup
 */
export async function createDatabaseBackup(
  options: DatabaseBackupOptions = {}
): Promise<AutomationResult> {
  await connectDB();

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

    const backupDir = options.backupPath || path.join(process.cwd(), 'backups');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `backup-${timestamp}.json`;
    const backupFilePath = path.join(backupDir, backupFileName);

    // Ensure backup directory exists
    try {
      await fs.mkdir(backupDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    // Get database connection
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not available');
    }

    // Get all collections
    const collections = await db.listCollections().toArray();
    const backupData: Record<string, any[]> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any

    // Export each collection
    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name;
      
      // Skip system collections
      if (collectionName.startsWith('system.')) {
        continue;
      }

      // If tenantId specified, filter by tenant
      if (options.tenantId) {
        const collection = db.collection(collectionName);
        const documents = await collection.find({ tenantId: new mongoose.Types.ObjectId(options.tenantId) }).toArray();
        if (documents.length > 0) {
          backupData[collectionName] = documents;
        }
      } else {
        const collection = db.collection(collectionName);
        const documents = await collection.find({}).limit(10000).toArray(); // Limit to prevent memory issues
        if (documents.length > 0) {
          backupData[collectionName] = documents;
        }
      }
    }

    // Write backup to file
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
