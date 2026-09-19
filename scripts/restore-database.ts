/**
 * Database restore script (Postgres / pg_restore)
 * Usage:
 *   npx tsx scripts/restore-database.ts --file=<path> [options]
 *
 * Options:
 *   --file=<path>   Path to the backup .dump file (pg_dump custom format, -Fc) (required)
 *   --clear         Pass --clean to pg_restore (drop existing objects before recreating)
 *   --dry-run       List the dump's contents without writing anything
 *   --force         Skip the confirmation prompt
 *
 * Note: unlike the old Mongo JSON restore, pg_restore operates on the whole
 * dump — there is no per-collection/table restore filtering, so the
 * `--collections=` flag from the Mongo-era script is not applicable and has
 * been removed.
 *
 * Examples:
 *   npm run db:restore -- --file=backups/backup-2026-06-16T02-00-00-000Z.dump
 *   npm run db:restore -- --file=backups/backup-2026-06-16T02-00-00-000Z.dump --clear
 *   npm run db:restore -- --file=backups/backup-2026-06-16T02-00-00-000Z.dump --dry-run
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import readline from 'readline';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

import fs from 'fs/promises';
import path from 'path';
import { restoreDatabaseBackup } from '../lib/automations/database-backups';

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

const fileArg = getArg('file');
const clearExisting = hasFlag('clear');
const dryRun = hasFlag('dry-run');
const force = hasFlag('force');

if (!fileArg) {
  console.error('Error: --file=<path> is required.');
  console.error('Usage: npm run db:restore -- --file=backups/backup-YYYY-MM-DDTHH-mm-ss.dump');
  process.exit(1);
}

const filePath = path.isAbsolute(fileArg) ? fileArg : resolve(process.cwd(), fileArg);

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer); }));
}

async function main() {
  // Validate file
  try {
    await fs.access(filePath);
  } catch {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const stat = await fs.stat(filePath);
  const sizeMB = (stat.size / (1024 * 1024)).toFixed(2);

  console.log('\nDatabase Restore');
  console.log('================');
  console.log(`File:        ${filePath}`);
  console.log(`Size:        ${sizeMB} MB`);
  console.log(`Clear first: ${clearExisting ? 'YES — existing objects will be dropped before restore' : 'No'}`);
  console.log(`Dry run:     ${dryRun ? 'Yes (no writes)' : 'No'}`);
  console.log('');

  if (clearExisting && !dryRun && !force) {
    const answer = await prompt(
      'WARNING: --clear will drop existing database objects before restoring.\nType "yes" to continue: '
    );
    if (answer.trim().toLowerCase() !== 'yes') {
      console.log('Aborted.');
      process.exit(0);
    }
  } else if (!dryRun && !force) {
    const answer = await prompt('Proceed with restore? (yes/no): ');
    if (answer.trim().toLowerCase() !== 'yes') {
      console.log('Aborted.');
      process.exit(0);
    }
  }

  console.log(`\n${dryRun ? 'Inspecting' : 'Restoring from'} backup via pg_restore...\n`);

  const result = await restoreDatabaseBackup({
    backupFilePath: filePath,
    clearExisting,
    dryRun,
  });

  console.log(result.message);
  if (result.errors.length > 0) {
    console.log(`\nWarnings (${result.errors.length}):`);
    result.errors.forEach(e => console.log(`  - ${e}`));
  }

  if (!result.success) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\nFatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
