/**
 * Build/reconcile MongoDB indexes from the Mongoose schemas.
 *
 * Production connections run with autoIndex disabled (lib/mongodb.ts), so run
 * this once per deploy that changes an index definition.
 *
 * Usage:
 *   pnpm db:sync-indexes            # dry run — prints indexes to create / drop
 *   pnpm db:sync-indexes --apply    # create missing indexes and DROP undeclared ones
 *   pnpm db:sync-indexes --apply --only=Transaction,Product
 *
 * WARNING: --apply drops every index that isn't declared in a schema, including
 * indexes added by hand in Atlas. Review the dry run first, and check
 * `db.<coll>.aggregate([{ $indexStats: {} }])` before dropping a used index.
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import { readdirSync } from 'fs';
import { pathToFileURL } from 'url';

// Load .env.local file (Next.js convention)
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
// Also try .env as fallback
dotenv.config({ path: resolve(process.cwd(), '.env') });

import mongoose from 'mongoose';
import { reconcileLegacyTransactionIndexes } from '../lib/transaction-indexes';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const onlyArg = args.find((a) => a.startsWith('--only='));
const only = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',')) : null;

async function loadModels(): Promise<void> {
  const modelsDir = resolve(process.cwd(), 'models');
  for (const file of readdirSync(modelsDir)) {
    if (file.endsWith('.ts') && !file.endsWith('.test.ts')) {
      // file:// URL — the ESM loader rejects bare absolute paths on Windows
      await import(pathToFileURL(resolve(modelsDir, file)).href);
    }
  }
  // Models defined outside models/
  await import('../lib/token-blacklist');
  await import('../lib/receipt');
}

async function main() {
  // Connect directly with auto-indexing OFF: loading the models must never build
  // indexes as a side effect (that would turn the dry run into a write).
  mongoose.set('autoIndex', false);
  mongoose.set('autoCreate', false);
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
  await loadModels();

  if (apply && (!only || only.has('Transaction'))) {
    await reconcileLegacyTransactionIndexes();
  }

  const names = mongoose.modelNames().filter((n) => !only || only.has(n)).sort();
  let totalCreate = 0;
  let totalDrop = 0;

  for (const name of names) {
    const model = mongoose.model(name);
    const diff = await model.diffIndexes();
    const toCreate = diff.toCreate.map((spec) => JSON.stringify(spec));
    const toDrop = diff.toDrop as string[];
    totalCreate += toCreate.length;
    totalDrop += toDrop.length;

    if (toCreate.length || toDrop.length) {
      console.log(`\n${name} (${model.collection.name})`);
      for (const spec of toCreate) console.log(`  + create ${spec}`);
      for (const idx of toDrop) console.log(`  - drop   ${idx}`);
    }

    if (apply && (toCreate.length || toDrop.length)) {
      await model.syncIndexes();
      console.log('  ✓ synced');
    }
  }

  console.log(
    `\n${apply ? 'Applied' : 'Dry run'}: ${totalCreate} index(es) to create, ${totalDrop} to drop across ${names.length} model(s).`
  );
  if (!apply && (totalCreate || totalDrop)) {
    console.log('Re-run with --apply to make these changes.');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
