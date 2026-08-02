/**
 * Postgres database restore script — replaces restore-database.ts's MongoDB
 * restore once the migration cutover repoints the app at Postgres. Uses
 * pg_restore (via `docker exec`), matching backup-database-postgres.ts's
 * custom-format .dump output.
 *
 * Usage:
 *   npx tsx scripts/restore-database-postgres.ts --file=<path> [options]
 *
 * Options:
 *   --file=<path>   Path to the .dump file (required)
 *   --clean         Drop existing objects before restoring (pg_restore --clean)
 *   --force         Skip the confirmation prompt
 *
 * Examples:
 *   npm run db:restore:postgres -- --file=backups-postgres/backup-2026-08-02T14-00-00-000Z.dump
 *   npm run db:restore:postgres -- --file=backups-postgres/backup-....dump --clean --force
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

import fs from 'fs/promises';
import readline from 'readline';
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

function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(query, (answer) => { rl.close(); res(answer); }));
}

async function main() {
  const fileArg = getArg('file');
  const clean = hasFlag('clean');
  const force = hasFlag('force');

  if (!fileArg) {
    console.error('Error: --file=<path> is required');
    process.exit(1);
  }

  await fs.access(fileArg).catch(() => {
    console.error(`Error: File not found: ${fileArg}`);
    process.exit(1);
  });

  console.log(`This will restore into database "${PG_DATABASE}" on container "${PG_CONTAINER}"${clean ? ' (dropping existing objects first)' : ''}.`);
  if (!force) {
    const answer = await askQuestion('Are you sure you want to continue? (yes/no): ');
    if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
      console.log('Cancelled.');
      return;
    }
  }

  const filename = fileArg.split(/[\\/]/).pop()!;
  const containerPath = `/tmp/${filename}`;

  console.log('Copying dump into the container...');
  await execFileAsync('docker', ['cp', fileArg, `${PG_CONTAINER}:${containerPath}`]);

  console.log('Running pg_restore...');
  const restoreArgs = ['exec', PG_CONTAINER, 'pg_restore', '-U', PG_USER, '-d', PG_DATABASE, '--no-owner'];
  if (clean) restoreArgs.push('--clean', '--if-exists');
  restoreArgs.push(containerPath);

  try {
    const { stdout, stderr } = await execFileAsync('docker', restoreArgs);
    if (stdout) console.log(stdout);
    if (stderr) console.warn(stderr);
  } finally {
    await execFileAsync('docker', ['exec', PG_CONTAINER, 'rm', containerPath]);
  }

  console.log('\n✓ Restore complete.');
}

main().catch((err) => {
  console.error('Restore failed:', err);
  process.exit(1);
});
