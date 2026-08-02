/**
 * Export every MongoDB collection to newline-delimited JSON for the Postgres migration.
 * Usage:
 *   npx tsx scripts/migrations/01-export.ts [--out=<dir>] [--collections=Tenant,User,...]
 *
 * Writes one .ndjson file per collection to the output dir, plus a manifest.json
 * recording the export timestamp (the migration's "as-of" point) and row counts.
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('Error: MONGODB_URI is not set in your environment.');
  process.exit(1);
}

const args = process.argv.slice(2);
const getArg = (name: string) => {
  const entry = args.find((a) => a.startsWith(`--${name}=`));
  return entry ? entry.split('=').slice(1).join('=') : null;
};

const outDir = getArg('out') || path.join(process.cwd(), 'scripts', 'migrations', 'exports');
const onlyCollections = getArg('collections')?.split(',').map((s) => s.trim());

async function main() {
  await mongoose.connect(MONGODB_URI as string);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No database connection');

  fs.mkdirSync(outDir, { recursive: true });

  const exportedAt = new Date().toISOString();
  const allCollections = await db.listCollections().toArray();
  const targetNames = allCollections
    .map((c) => c.name)
    .filter((name) => !onlyCollections || onlyCollections.includes(name));

  const manifest: { exportedAt: string; collections: Record<string, number> } = {
    exportedAt,
    collections: {},
  };

  for (const name of targetNames) {
    const filePath = path.join(outDir, `${name}.ndjson`);
    const stream = fs.createWriteStream(filePath, { flags: 'w' });
    let count = 0;

    const cursor = db.collection(name).find({});
    for await (const doc of cursor) {
      stream.write(JSON.stringify(doc) + '\n');
      count++;
    }
    stream.end();

    manifest.collections[name] = count;
    console.log(`Exported ${name}: ${count} documents -> ${filePath}`);
  }

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\nExport complete. As-of timestamp: ${exportedAt}`);
  console.log(`Manifest written to ${path.join(outDir, 'manifest.json')}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Export failed:', err);
  process.exit(1);
});
