/**
 * Database size report (read-only) — Phase 0 of the PostgreSQL migration.
 * Sizes every collection so we can pick ETL batch sizes and estimate the
 * cutover maintenance window. See docs/postgres-migration.md.
 *
 * Usage:
 *   npx tsx scripts/db-size-report.ts [options]
 *
 * Options:
 *   --by-tenant        Also count documents per tenant for tenant-scoped
 *                      collections (uses the {tenantId, ...} indexes, but on
 *                      Atlas this still bills index-key reads — opt-in)
 *   --top=<n>          Number of tenants to show per collection (default: 10)
 *   --sample=<n>       Docs sampled to estimate embedded array lengths (default: 500)
 *   --out=<file>       JSON output path (default: ./db-size-report.json)
 *
 * Examples:
 *   pnpm db:size-report
 *   pnpm db:size-report -- --by-tenant --top=20
 *
 * Run it against production (or a restored snapshot) with a read-only user.
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

const byTenant = hasFlag('by-tenant');
const topN = parseInt(getArg('top') || '10', 10);
const sampleSize = parseInt(getArg('sample') || '500', 10);
const outFile = getArg('out') || path.join(process.cwd(), 'db-size-report.json');

// Embedded arrays that become child tables in Postgres (see plan, Phase 2).
// Their average length tells us how many child rows the ETL will produce.
const EMBEDDED_ARRAYS: Record<string, string[]> = {
  transactions: ['items', 'splitPayments'],
  products: ['variations', 'branchStock'],
  prescriptions: ['items'],
  productbundles: ['items'],
  invoices: ['items'],
  subscriptions: ['billingHistory'],
  offlinetransactions: ['items'],
  savedcarts: ['items'],
};

interface CollectionReport {
  name: string;
  count: number;
  avgObjSize: number;
  size: number;
  storageSize: number;
  totalIndexSize: number;
  indexCount: number;
  hasTenantId: boolean;
  embeddedArrays?: Record<string, { avgLength: number; estimatedRows: number }>;
  topTenants?: { tenantId: string; count: number }[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(2)} ${units[i]}`;
}

async function getStats(db: mongoose.mongo.Db, name: string) {
  // $collStats works on Atlas and replaces the deprecated collStats command.
  try {
    const [result] = await db
      .collection(name)
      .aggregate([{ $collStats: { storageStats: {} } }])
      .toArray();
    const s = result?.storageStats ?? {};
    return {
      count: s.count ?? 0,
      avgObjSize: s.avgObjSize ?? 0,
      size: s.size ?? 0,
      storageSize: s.storageSize ?? 0,
      totalIndexSize: s.totalIndexSize ?? 0,
      indexCount: s.nindexes ?? 0,
    };
  } catch {
    // Some tiers/users can't run $collStats — fall back to a metadata count.
    const count = await db.collection(name).estimatedDocumentCount();
    return { count, avgObjSize: 0, size: 0, storageSize: 0, totalIndexSize: 0, indexCount: 0 };
  }
}

async function estimateArrays(db: mongoose.mongo.Db, name: string, fields: string[], count: number) {
  const project: Record<string, unknown> = {};
  for (const f of fields) {
    project[f] = { $size: { $ifNull: [`$${f}`, []] } };
  }
  const sampled = await db
    .collection(name)
    .aggregate([{ $sample: { size: sampleSize } }, { $project: project }])
    .toArray();

  const result: Record<string, { avgLength: number; estimatedRows: number }> = {};
  for (const f of fields) {
    const avg = sampled.length
      ? sampled.reduce((sum, doc) => sum + (doc[f] as number), 0) / sampled.length
      : 0;
    result[f] = { avgLength: Number(avg.toFixed(2)), estimatedRows: Math.round(avg * count) };
  }
  return result;
}

async function countByTenant(db: mongoose.mongo.Db, name: string) {
  const rows = await db
    .collection(name)
    .aggregate([
      { $group: { _id: '$tenantId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: topN },
    ])
    .toArray();
  return rows.map(r => ({ tenantId: String(r._id), count: r.count as number }));
}

async function main() {
  await mongoose.connect(MONGODB_URI as string);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No database handle after connect');

  const collections = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map(c => c.name)
    .filter(n => !n.startsWith('system.'))
    .sort();

  console.log(`Database: ${db.databaseName} — ${collections.length} collections\n`);

  const reports: CollectionReport[] = [];
  for (const name of collections) {
    const stats = await getStats(db, name);
    const hasTenantId = stats.count > 0
      ? !!(await db.collection(name).findOne({ tenantId: { $exists: true } }, { projection: { _id: 1 } }))
      : false;

    const report: CollectionReport = { name, ...stats, hasTenantId };

    if (EMBEDDED_ARRAYS[name] && stats.count > 0) {
      report.embeddedArrays = await estimateArrays(db, name, EMBEDDED_ARRAYS[name], stats.count);
    }
    if (byTenant && hasTenantId) {
      report.topTenants = await countByTenant(db, name);
    }
    reports.push(report);
  }

  reports.sort((a, b) => b.size - a.size);

  const totals = reports.reduce(
    (acc, r) => ({
      count: acc.count + r.count,
      size: acc.size + r.size,
      storageSize: acc.storageSize + r.storageSize,
      totalIndexSize: acc.totalIndexSize + r.totalIndexSize,
    }),
    { count: 0, size: 0, storageSize: 0, totalIndexSize: 0 }
  );
  const childRows = reports.reduce(
    (sum, r) => sum + Object.values(r.embeddedArrays ?? {}).reduce((s, a) => s + a.estimatedRows, 0),
    0
  );

  console.table(
    reports.map(r => ({
      collection: r.name,
      docs: r.count,
      avgDoc: formatBytes(r.avgObjSize),
      data: formatBytes(r.size),
      indexes: `${r.indexCount} / ${formatBytes(r.totalIndexSize)}`,
      tenant: r.hasTenantId ? 'yes' : '',
    }))
  );

  for (const r of reports.filter(r => r.embeddedArrays)) {
    for (const [field, est] of Object.entries(r.embeddedArrays!)) {
      console.log(`  ${r.name}.${field}: avg ${est.avgLength} → ~${est.estimatedRows} child rows`);
    }
  }

  if (byTenant) {
    console.log('\nTop tenants by document count:');
    for (const r of reports.filter(r => r.topTenants?.length)) {
      console.log(`  ${r.name}: ${r.topTenants!.map(t => `${t.tenantId}=${t.count}`).join(', ')}`);
    }
  }

  console.log('\nTotals:');
  console.log(`  Documents:            ${totals.count}`);
  console.log(`  Est. child-table rows: ${childRows}`);
  console.log(`  Data size:            ${formatBytes(totals.size)}`);
  console.log(`  Storage size:         ${formatBytes(totals.storageSize)}`);
  console.log(`  Index size:           ${formatBytes(totals.totalIndexSize)}`);

  await fs.writeFile(
    outFile,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), database: db.databaseName, totals: { ...totals, childRows }, collections: reports },
      null,
      2
    )
  );
  console.log(`\nReport written to ${outFile}`);
}

main()
  .catch(err => {
    console.error('Size report failed:', err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
