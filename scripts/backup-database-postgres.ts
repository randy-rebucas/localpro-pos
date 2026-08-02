/**
 * Postgres database backup script — replaces backup-database.ts's MongoDB
 * dump once the migration cutover repoints the app at Postgres. Uses
 * pg_dump in custom format (via `docker exec` against the local dev
 * Postgres container; point PG_CONTAINER at a different container/host
 * setup in other environments).
 *
 * Usage:
 *   npx tsx scripts/backup-database-postgres.ts [options]
 *
 * Options:
 *   --list           List existing backup files
 *   --delete=<file>  Delete a specific backup file by name
 *   --keep=<n>       Number of backups to retain (default: 7)
 *   --out=<dir>      Custom output directory (default: ./backups-postgres)
 *
 * Examples:
 *   npm run db:backup:postgres
 *   npm run db:backup:postgres -- --list
 *   npm run db:backup:postgres -- --keep=14
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const PG_CONTAINER = process.env.PG_BACKUP_CONTAINER || 'localpro-pos-postgres-1';
const PG_USER = process.env.PG_BACKUP_USER || 'postgres';
const PG_DATABASE = process.env.PG_BACKUP_DATABASE || 'localpro_pos';

const args = process.argv.slice(2);
const getArg = (name: string) => {
  const entry = args.find((a) => a.startsWith(`--${name}=`));
  return entry ? entry.split('=').slice(1).join('=') : null;
};
const hasFlag = (name: string) => args.includes(`--${name}`);

const outDir = getArg('out') || path.join(process.cwd(), 'backups-postgres');
const listMode = hasFlag('list');
const deleteFile = getArg('delete');
const keepCount = parseInt(getArg('keep') || '7', 10);

async function listBackups() {
  let files: { name: string; size: number; createdAt: Date }[] = [];
  try {
    const entries = await fs.readdir(outDir);
    const stats = await Promise.all(
      entries
        .filter((f) => f.endsWith('.dump'))
        .map(async (name) => {
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
    const sizeStr = f.size < 1024 * 1024 ? `${(f.size / 1024).toFixed(1)} KB` : `${(f.size / (1024 * 1024)).toFixed(2)} MB`;
    console.log(`  ${f.name.padEnd(50)}${sizeStr.padStart(10)}  ${f.createdAt.toLocaleString()}`);
  }
  console.log(`\n  Total: ${files.length} backup(s)\n`);
}

async function deleteBackup(filename: string) {
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

async function pruneOldBackups() {
  const entries = await fs.readdir(outDir);
  const dumps = entries.filter((f) => f.endsWith('.dump'));
  if (dumps.length <= keepCount) return;

  const withStats = await Promise.all(
    dumps.map(async (name) => ({ name, mtime: (await fs.stat(path.join(outDir, name))).mtime }))
  );
  withStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  const toDelete = withStats.slice(keepCount);
  for (const f of toDelete) {
    await fs.unlink(path.join(outDir, f.name));
    console.log(`Pruned old backup: ${f.name}`);
  }
}

async function createBackup() {
  await fs.mkdir(outDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup-${timestamp}.dump`;
  const filePath = path.join(outDir, filename);
  const containerPath = `/tmp/${filename}`;

  console.log(`Running pg_dump inside container "${PG_CONTAINER}"...`);
  await execFileAsync('docker', [
    'exec', PG_CONTAINER,
    'pg_dump', '-U', PG_USER, '-d', PG_DATABASE,
    '-F', 'c', // custom format — compressed, restorable with pg_restore, supports parallel restore
    '-f', containerPath,
  ]);

  console.log('Copying dump out of the container...');
  await execFileAsync('docker', ['cp', `${PG_CONTAINER}:${containerPath}`, filePath]);
  await execFileAsync('docker', ['exec', PG_CONTAINER, 'rm', containerPath]);

  const stat = await fs.stat(filePath);
  console.log(`\n✓ Backup complete: ${filePath} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);

  await pruneOldBackups();
}

async function main() {
  if (listMode) {
    await listBackups();
    return;
  }
  if (deleteFile) {
    await deleteBackup(deleteFile);
    return;
  }
  await createBackup();
}

main().catch((err) => {
  console.error('Backup failed:', err);
  process.exit(1);
});
