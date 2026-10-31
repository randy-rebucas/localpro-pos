/**
 * Reconcile MongoDB indexes with the Mongoose schemas in models/.
 *
 * Mongoose autoIndex only *creates* missing indexes — it never drops indexes
 * that were removed from a schema, and every extra index costs write units on
 * every insert/update. This script shows the difference and, with --apply,
 * builds missing indexes and drops ones no longer declared.
 *
 * Usage:
 *   npx tsx scripts/sync-indexes.ts            # dry run: print what would change
 *   npx tsx scripts/sync-indexes.ts --apply    # apply changes
 *   npx tsx scripts/sync-indexes.ts --apply Transaction Booking   # only these models
 *
 * Review the dry run first: indexes created by hand in Atlas (not declared in a
 * schema) will be listed under "drop" and removed by --apply.
 */

import dotenv from 'dotenv';
import { resolve, join } from 'path';
import { readdirSync } from 'fs';
import { pathToFileURL } from 'url';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

import mongoose from 'mongoose';
import connectDB from '../lib/mongodb';

async function loadModels(): Promise<void> {
  const dir = resolve(process.cwd(), 'models');
  for (const file of readdirSync(dir)) {
    if (file.endsWith('.ts')) await import(pathToFileURL(join(dir, file)).href);
  }
  // Models declared outside models/ (RevokedToken, UserRevocation). Keep this list
  // in sync with `grep -rn "mongoose.model(" lib app` — PosSession and Counter
  // now live in models/ and are picked up above.
  await import('../lib/token-blacklist');
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const only = new Set(args.filter((a) => !a.startsWith('--')));

  await connectDB();
  await loadModels();

  for (const name of mongoose.modelNames().sort()) {
    if (only.size && !only.has(name)) continue;
    const model = mongoose.model(name);
    const diff = await model.diffIndexes();
    if (!diff.toCreate.length && !diff.toDrop.length) continue;

    console.log(`\n${name} (${model.collection.collectionName})`);
    for (const spec of diff.toCreate) console.log('  + create', JSON.stringify(spec));
    for (const idx of diff.toDrop) console.log('  - drop  ', idx);

    if (apply) {
      await model.syncIndexes();
      console.log('  applied');
    }
  }

  if (!apply) console.log('\nDry run only. Re-run with --apply to make these changes.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
