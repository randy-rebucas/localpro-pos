/**
 * Database backup script
 * Usage:
 *   npx tsx scripts/backup-database.ts [options]
 *
 * Options:
 *   --tenant=<id>      Backup only a specific tenant (by ObjectId)
 *   --cloud            Upload to S3-compatible cloud storage after backup
 *   --list             List existing backup files
 *   --delete=<file>    Delete a specific backup file by name
 *   --keep=<n>         Number of backups to retain (default: 7)
 *   --out=<dir>        Custom output directory (default: ./backups)
 *
 * Examples:
 *   npm run db:backup
 *   npm run db:backup -- --cloud
 *   npm run db:backup -- --tenant=64abc123def456 --cloud
 *   npm run db:backup -- --list
 *   npm run db:backup -- --delete=backup-2026-01-01T02-00-00-000Z.json
 *   npm run db:backup -- --keep=14
 *   npm run db:backup -- --out=/mnt/backups
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import fs from 'fs/promises';
import path from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('Error: MONGODB_URI is not set in your environment.');
  process.exit(1);
}

// Parse CLI args
const args = process.argv.slice(2);
const getArg = (name: string) => {
  const entry = args.find(a => a.startsWith(`--${name}=`));
  return entry ? entry.split('=').slice(1).join('=') : null;
};
const hasFlag = (name: string) => args.includes(`--${name}`);

const tenantId = getArg('tenant');
const uploadToCloud = hasFlag('cloud');
const listMode = hasFlag('list');
const deleteFile = getArg('delete');
const keepCount = parseInt(getArg('keep') || '7', 10);
const outDir = getArg('out') || path.join(process.cwd(), 'backups');

async function connectDB() {
  await mongoose.connect(MONGODB_URI as string);
}

async function listBackups() {
  let files: { name: string; size: number; createdAt: Date }[] = [];
  try {
    const entries = await fs.readdir(outDir);
    const stats = await Promise.all(
      entries
        .filter(f => f.endsWith('.json'))
        .map(async name => {
          const stat = await fs.stat(path.join(outDir, name));
          return { name, size: stat.size, createdAt: stat.mtime };
        })
    );
    files = stats.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  } catch {
    console.log('No backup directory found at:', outDir);
    return;
  }

  if (files.length === 0) {
    console.log('No backup files found in:', outDir);
    return;
  }

  console.log(`\nBackup files in ${outDir}:\n`);
  console.log('  Name'.padEnd(52) + 'Size'.padStart(10) + '  Created');
  console.log('  ' + '-'.repeat(72));
  for (const f of files) {
    const sizeStr = f.size < 1024 * 1024
      ? `${(f.size / 1024).toFixed(1)} KB`
      : `${(f.size / (1024 * 1024)).toFixed(2)} MB`;
    console.log(`  ${f.name.padEnd(50)}${sizeStr.padStart(10)}  ${f.createdAt.toLocaleString()}`);
  }
  console.log(`\n  Total: ${files.length} backup(s)\n`);
}

async function deleteBackup(filename: string) {
  // Prevent path traversal
  if (!/^[\w.-]+$/.test(filename)) {
    console.error('Error: Invalid filename. Only alphanumeric, dash, underscore, and dot are allowed.');
    process.exit(1);
  }
  const filePath = path.join(outDir, filename);
  try {
    await fs.unlink(filePath);
    console.log(`Deleted: ${filePath}`);
  } catch {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }
}

async function createBackup() {
  console.log('Connecting to database...');
  await connectDB();
  console.log('Connected.\n');

  await fs.mkdir(outDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup-${timestamp}.json`;
  const filePath = path.join(outDir, filename);

  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection not available');

  const collections = await db.listCollections().toArray();
  const backupData: Record<string, unknown[]> = {};
  let totalDocs = 0;

  console.log(`Exporting ${collections.length} collection(s)...\n`);

  for (const col of collections) {
    if (col.name.startsWith('system.')) continue;

    const collection = db.collection(col.name);
    const query = tenantId
      ? { tenantId: new mongoose.Types.ObjectId(tenantId) }
      : {};

    const docs = await collection.find(query).limit(50000).toArray();
    if (docs.length > 0) {
      backupData[col.name] = docs;
      totalDocs += docs.length;
      console.log(`  ${col.name.padEnd(30)} ${docs.length.toLocaleString()} documents`);
    }
  }

  console.log(`\nWriting backup to: ${filePath}`);
  const payload = {
    version: '1.0',
    createdAt: new Date().toISOString(),
    tenantId: tenantId || null,
    totalDocuments: totalDocs,
    collections: backupData,
  };
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');

  const stat = await fs.stat(filePath);
  const sizeMB = (stat.size / (1024 * 1024)).toFixed(2);
  console.log(`Backup size: ${sizeMB} MB`);
  console.log(`Total documents: ${totalDocs.toLocaleString()}`);

  // Rotate old backups
  const allFiles = (await fs.readdir(outDir))
    .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
    .sort()
    .reverse();

  if (allFiles.length > keepCount) {
    const toDelete = allFiles.slice(keepCount);
    console.log(`\nRotating old backups (keeping ${keepCount}, deleting ${toDelete.length})...`);
    for (const old of toDelete) {
      await fs.unlink(path.join(outDir, old)).catch(() => null);
      console.log(`  Deleted: ${old}`);
    }
  }

  // Cloud upload
  if (uploadToCloud) {
    const bucket = process.env.BACKUP_S3_BUCKET;
    const accessKeyId = process.env.BACKUP_S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.BACKUP_S3_SECRET_ACCESS_KEY;
    const region = process.env.BACKUP_S3_REGION || 'ap-southeast-1';
    const endpoint = process.env.BACKUP_S3_ENDPOINT;

    if (!bucket || !accessKeyId || !secretAccessKey) {
      console.error('\nCloud upload skipped: missing BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY_ID, or BACKUP_S3_SECRET_ACCESS_KEY.');
    } else {
      console.log('\nUploading to cloud storage...');
      const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
      const client = new S3Client({
        region,
        credentials: { accessKeyId, secretAccessKey },
        ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
      });
      const key = tenantId ? `backups/${tenantId}/${filename}` : `backups/full/${filename}`;
      const fileContent = await fs.readFile(filePath);
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: fileContent,
        ContentType: 'application/json',
      }));
      console.log(`Uploaded to s3://${bucket}/${key}`);
    }
  }

  console.log('\nBackup complete:', filename);
}

async function main() {
  try {
    if (listMode) {
      await listBackups();
      return;
    }

    if (deleteFile) {
      await deleteBackup(deleteFile);
      return;
    }

    await createBackup();
  } catch (err: unknown) {
    console.error('\nError:', err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await mongoose.disconnect().catch(() => null);
  }
}

main();
