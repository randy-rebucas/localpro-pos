/**
 * Database restore script
 * Usage:
 *   npx tsx scripts/restore-database.ts --file=<path> [options]
 *
 * Options:
 *   --file=<path>          Path to the backup JSON file (required)
 *   --clear                Delete existing documents before inserting (default: false)
 *   --collections=<names>  Comma-separated list of collections to restore (default: all)
 *   --dry-run              Parse the file and count documents without writing anything
 *   --force                Skip the confirmation prompt
 *
 * Examples:
 *   npm run db:restore -- --file=backups/backup-2026-06-16T02-00-00-000Z.json
 *   npm run db:restore -- --file=backups/backup-2026-06-16T02-00-00-000Z.json --clear
 *   npm run db:restore -- --file=backups/backup-2026-06-16T02-00-00-000Z.json --collections=products,customers
 *   npm run db:restore -- --file=backups/backup-2026-06-16T02-00-00-000Z.json --dry-run
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import readline from 'readline';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

import mongoose from 'mongoose';
import fs from 'fs/promises';
import path from 'path';

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

const fileArg = getArg('file');
const clearExisting = hasFlag('clear');
const dryRun = hasFlag('dry-run');
const force = hasFlag('force');
const collectionsArg = getArg('collections');
const collections = collectionsArg
  ? collectionsArg.split(',').map(c => c.trim()).filter(Boolean)
  : undefined;

if (!fileArg) {
  console.error('Error: --file=<path> is required.');
  console.error('Usage: npm run db:restore -- --file=backups/backup-YYYY-MM-DDTHH-mm-ss.json');
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
  console.log(`Clear first: ${clearExisting ? 'YES — existing documents will be deleted' : 'No (merge/upsert)'}`);
  console.log(`Collections: ${collections ? collections.join(', ') : 'all'}`);
  console.log(`Dry run:     ${dryRun ? 'Yes (no writes)' : 'No'}`);
  console.log('');

  if (clearExisting && !dryRun && !force) {
    const answer = await prompt(
      'WARNING: --clear will delete all existing documents in the restored collections before inserting.\nType "yes" to continue: '
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

  console.log('\nConnecting to database...');
  await mongoose.connect(MONGODB_URI as string);
  console.log('Connected.\n');

  const raw = await fs.readFile(filePath, 'utf-8');
  const backupData = JSON.parse(raw);

  // Support both backup formats
  const collectionsMap: Record<string, unknown[]> =
    backupData.collections ?? backupData;

  const db = mongoose.connection.db;
  if (!db) {
    console.error('Error: Database connection not available.');
    process.exit(1);
  }

  const targetCollections = collections ?? Object.keys(collectionsMap);
  let totalInserted = 0;
  let totalCleared = 0;
  const errors: string[] = [];

  console.log(`${dryRun ? '[DRY RUN] Scanning' : 'Restoring'} ${targetCollections.length} collection(s)...\n`);

  for (const collectionName of targetCollections) {
    const docs = collectionsMap[collectionName];
    if (!Array.isArray(docs)) {
      console.log(`  ${collectionName.padEnd(30)} skipped (not in backup)`);
      continue;
    }

    if (dryRun) {
      console.log(`  ${collectionName.padEnd(30)} ${docs.length.toLocaleString()} documents (would insert)`);
      totalInserted += docs.length;
      continue;
    }

    const collection = db.collection(collectionName);
    let cleared = 0;

    if (clearExisting) {
      const del = await collection.deleteMany({});
      cleared = del.deletedCount ?? 0;
      totalCleared += cleared;
    }

    // Re-hydrate ObjectId _id fields
    const hydrated = docs.map((doc: unknown) => {
      const d = { ...(doc as Record<string, unknown>) };
      if (d._id && typeof d._id === 'string' && mongoose.Types.ObjectId.isValid(d._id as string)) {
        d._id = new mongoose.Types.ObjectId(d._id as string);
      } else if (d._id && typeof d._id === 'object' && (d._id as Record<string, unknown>).$oid) {
        d._id = new mongoose.Types.ObjectId((d._id as Record<string, unknown>).$oid as string);
      }
      return d;
    });

    let inserted = 0;
    const CHUNK = 500;
    for (let i = 0; i < hydrated.length; i += CHUNK) {
      try {
        const res = await collection.insertMany(hydrated.slice(i, i + CHUNK), { ordered: false });
        inserted += res.insertedCount;
      } catch (err: unknown) {
        const bulkErr = err as { result?: { insertedCount?: number }; message?: string };
        inserted += bulkErr.result?.insertedCount ?? 0;
        errors.push(`${collectionName}: ${bulkErr.message ?? err}`);
      }
    }

    totalInserted += inserted;
    const clearNote = clearExisting ? ` (cleared ${cleared})` : '';
    console.log(`  ${collectionName.padEnd(30)} ${inserted.toLocaleString()} inserted${clearNote}`);
  }

  console.log('\n---');
  if (dryRun) {
    console.log(`[DRY RUN] Would insert ${totalInserted.toLocaleString()} documents. No changes were made.`);
  } else {
    console.log(`Inserted:  ${totalInserted.toLocaleString()} documents`);
    if (clearExisting) console.log(`Cleared:   ${totalCleared.toLocaleString()} documents deleted before restore`);
    if (errors.length > 0) {
      console.log(`\nWarnings (${errors.length}):`);
      errors.forEach(e => console.log(`  - ${e}`));
    }
    console.log('\nRestore complete.');
  }
}

main()
  .catch(err => {
    console.error('\nFatal error:', err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => mongoose.disconnect().catch(() => null));
