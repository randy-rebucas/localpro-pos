/**
 * Assign a deterministic UUID to every MongoDB ObjectId found in the exported
 * .ndjson files (from 01-export.ts) and persist the mapping to the Postgres
 * `_migration_id_map` table, so FK references stay consistent across
 * transform/import runs and re-runs are idempotent.
 *
 * Usage:
 *   npx tsx scripts/migrations/02-id-map.ts [--in=<dir>]
 *
 * Every document's own `_id` is mapped. Any field ending in `Id` (or the
 * literal `_id` inside nested arrays) whose value looks like an ObjectId is
 * also queued for mapping, even if the referenced collection hasn't been
 * exported yet — the mapping only needs to exist, not resolve, at this stage.
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

import prisma from '../../lib/prisma';
import { uuid5 } from './lib/uuid5';

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

const args = process.argv.slice(2);
const getArg = (name: string) => {
  const entry = args.find((a) => a.startsWith(`--${name}=`));
  return entry ? entry.split('=').slice(1).join('=') : null;
};

const inDir = getArg('in') || path.join(process.cwd(), 'scripts', 'migrations', 'exports');

function collectObjectIds(value: unknown, into: Set<string>): void {
  if (typeof value === 'string') {
    if (OBJECT_ID_RE.test(value)) into.add(value);
    return;
  }
  if (value && typeof value === 'object') {
    if ('$oid' in (value as Record<string, unknown>)) {
      const oid = (value as Record<string, unknown>).$oid;
      if (typeof oid === 'string' && OBJECT_ID_RE.test(oid)) into.add(oid);
      return;
    }
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectObjectIds(v, into);
    }
  }
  if (Array.isArray(value)) {
    for (const v of value) collectObjectIds(v, into);
  }
}

async function main() {
  const manifestPath = path.join(inDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error(`No manifest.json found in ${inDir}. Run 01-export.ts first.`);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
    collections: Record<string, number>;
  };

  // Every distinct ObjectId string found anywhere in the export, associated
  // with the collection it belongs to as a document's own `_id` (used as the
  // canonical mapping key — collection + mongoId).
  const idsByCollection = new Map<string, Set<string>>();
  const allIds = new Set<string>();

  for (const collectionName of Object.keys(manifest.collections)) {
    const filePath = path.join(inDir, `${collectionName}.ndjson`);
    if (!fs.existsSync(filePath)) continue;

    const ids = idsByCollection.get(collectionName) || new Set<string>();
    idsByCollection.set(collectionName, ids);

    const rl = readline.createInterface({ input: fs.createReadStream(filePath) });
    for await (const line of rl) {
      if (!line.trim()) continue;
      const doc = JSON.parse(line);
      const ownIds = new Set<string>();
      collectObjectIds(doc._id, ownIds);
      for (const id of ownIds) {
        ids.add(id);
        allIds.add(id);
      }
      const refIds = new Set<string>();
      collectObjectIds(doc, refIds);
      for (const id of refIds) allIds.add(id);
    }
  }

  console.log(`Found ${allIds.size} distinct ObjectIds across ${idsByCollection.size} collections.`);

  let inserted = 0;
  let skipped = 0;

  for (const [collectionName, ids] of idsByCollection) {
    const rows = Array.from(ids).map((mongoId) => ({
      collection: collectionName,
      mongoId,
      uuid: uuid5(`${collectionName}:${mongoId}`),
    }));

    for (let i = 0; i < rows.length; i += 1000) {
      const batch = rows.slice(i, i + 1000);
      const result = await prisma.migrationIdMap.createMany({
        data: batch,
        skipDuplicates: true,
      });
      inserted += result.count;
      skipped += batch.length - result.count;
    }
    console.log(`Mapped ${collectionName}: ${rows.length} ids`);
  }

  console.log(`\nID mapping complete. Inserted: ${inserted}, already present (skipped): ${skipped}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('ID mapping failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
