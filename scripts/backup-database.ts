/**
 * Database backup script (Postgres / pg_dump)
 * Usage:
 *   npx tsx scripts/backup-database.ts [options]
 *
 * Options:
 *   --tenant=<id>      Note: pg_dump cannot filter rows by tenant (see
 *                      lib/automations/database-backups.ts); a full-database
 *                      backup is produced and a warning is printed instead.
 *   --cloud            Upload to S3-compatible cloud storage after backup
 *   --list             List existing backup files
 *   --delete=<file>    Delete a specific backup file by name
 *   --keep=<n>         Number of backups to retain (default: 7)
 *   --out=<dir>        Custom output directory (default: ./backups)
 *
 * Examples:
 *   npm run db:backup
 *   npm run db:backup -- --cloud
 *   npm run db:backup -- --list
 *   npm run db:backup -- --delete=backup-2026-01-01T02-00-00-000Z.dump
 *   npm run db:backup -- --keep=14
 *   npm run db:backup -- --out=/mnt/backups
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import fs from 'fs/promises';
import path from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

import { createDatabaseBackup } from '../lib/automations/database-backups';

if (!process.env.DATABASE_URL) {
  console.error('Error: DATABASE_URL is not set in your environment.');
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

async function listBackups() {
  let files: { name: string; size: number; createdAt: Date }[] = [];
  try {
    const entries = await fs.readdir(outDir);
    const stats = await Promise.all(
      entries
        .filter(f => f.endsWith('.dump') || f.endsWith('.json') || f.endsWith('.bson'))
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

async function rotateOldBackups() {
  try {
    const allFiles = (await fs.readdir(outDir))
      .filter(f => f.startsWith('backup-') && f.endsWith('.dump'))
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
  } catch {
    // Ignore rotation errors
  }
}

async function createBackup() {
  await fs.mkdir(outDir, { recursive: true });

  console.log('Creating backup via pg_dump...\n');
  const result = await createDatabaseBackup({
    tenantId: tenantId || undefined,
    backupPath: outDir,
    uploadToCloud,
  });

  if (result.errors && result.errors.length > 0) {
    for (const err of result.errors) {
      console.log(`Note: ${err}`);
    }
  }

  if (!result.success) {
    console.error('\nBackup failed:', result.message);
    process.exit(1);
  }

  console.log(result.message);

  await rotateOldBackups();

  console.log('\nBackup complete.');
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
  }
}

main();
