/**
 * PostgreSQL infrastructure health check — Phase 1 of the PostgreSQL migration.
 * Verifies the pooled (PgBouncer) and direct connections, server version,
 * required extensions, TLS and round-trip latency. Read-only.
 *
 * Usage:
 *   npx tsx scripts/pg-health-check.ts [options]
 *
 * Options:
 *   --pings=<n>        Round trips used to measure latency (default: 20)
 *
 * Examples:
 *   pnpm pg:health
 *   pnpm pg:health -- --pings=50
 *
 * Reads DATABASE_URL (pooled, used by the app) and DATABASE_URL_DIRECT
 * (direct, used by migrations/ETL) from .env.local / .env.
 */

import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

import { Client } from 'pg';

const REQUIRED_EXTENSIONS = ['pg_trgm', 'btree_gist', 'pgcrypto', 'pg_stat_statements'];
const MIN_SERVER_VERSION = 170000;

// Parse CLI args
const args = process.argv.slice(2);
const getArg = (name: string) => {
  const entry = args.find(a => a.startsWith(`--${name}=`));
  return entry ? entry.split('=').slice(1).join('=') : null;
};

const pings = parseInt(getArg('pings') || '20', 10);

let failures = 0;
const pass = (msg: string) => console.log(`  ✓ ${msg}`);
const warn = (msg: string) => console.log(`  ⚠ ${msg}`);
const fail = (msg: string) => {
  failures++;
  console.log(`  ✗ ${msg}`);
};

function describe(url: string): string {
  const u = new URL(url);
  return `${u.hostname}:${u.port || 5432}${u.pathname}`;
}

function isLocal(url: string): boolean {
  const host = new URL(url).hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

async function measureLatency(client: Client) {
  const samples: number[] = [];
  for (let i = 0; i < pings; i++) {
    const start = performance.now();
    await client.query('SELECT 1');
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const p = (q: number) => samples[Math.min(samples.length - 1, Math.floor(q * samples.length))];
  return { p50: p(0.5), p95: p(0.95) };
}

async function checkConnection(label: string, url: string, direct: boolean) {
  console.log(`\n${label} — ${describe(url)}`);

  const requestsTls = /sslmode=(require|verify-ca|verify-full)/.test(url);
  if (!isLocal(url) && !requestsTls) {
    fail('remote connection without sslmode=require (or verify-full) — credentials would travel in clear text');
  }

  const client = new Client({ connectionString: url, connectionTimeoutMillis: 10000 });
  try {
    await client.connect();
    pass('connected');

    const { rows: [version] } = await client.query<{ server_version_num: string }>('SHOW server_version_num');
    const num = parseInt(version.server_version_num, 10);
    if (num >= MIN_SERVER_VERSION) pass(`server version ${Math.floor(num / 10000)}`);
    else fail(`server version ${Math.floor(num / 10000)} — expected 17 or newer`);

    const { rows: exts } = await client.query<{ extname: string }>('SELECT extname FROM pg_extension');
    const installed = new Set(exts.map(e => e.extname));
    const missing = REQUIRED_EXTENSIONS.filter(e => !installed.has(e));
    if (missing.length === 0) pass(`extensions: ${REQUIRED_EXTENSIONS.join(', ')}`);
    else fail(`missing extensions: ${missing.join(', ')} (run infra/postgres/init/01-extensions.sql)`);

    const { rows: [tz] } = await client.query<{ TimeZone: string }>('SHOW timezone');
    if (tz.TimeZone === 'UTC' || tz.TimeZone === 'Etc/UTC') pass('server timezone UTC');
    else warn(`server timezone ${tz.TimeZone} — expected UTC (reports convert per tenant timezone)`);

    if (direct) {
      const { rows: [ssl] } = await client.query<{ ssl: boolean | null }>(
        'SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()'
      );
      if (ssl?.ssl) pass('TLS in use');
      else if (isLocal(url)) warn('TLS not in use (fine for localhost / SSH tunnel)');
      else fail('TLS not in use');

      const { rows: [mc] } = await client.query<{ max_connections: string }>('SHOW max_connections');
      pass(`max_connections ${mc.max_connections}`);
    } else {
      // PgBouncer in transaction mode: session state must not leak between
      // transactions. SET LOCAL inside a transaction is the only safe form.
      await client.query('BEGIN');
      await client.query("SET LOCAL application_name = '1pos-health-check'");
      await client.query('COMMIT');
      pass('transaction round-trip (BEGIN / SET LOCAL / COMMIT)');
    }

    const { p50, p95 } = await measureLatency(client);
    const latencyMsg = `latency p50 ${p50.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms over ${pings} pings`;
    // Checkout runs ~10-20 queries; above ~20 ms per round trip the app and
    // database are probably in different regions.
    if (p50 <= 20) pass(latencyMsg);
    else warn(`${latencyMsg} — is the app running in the same region as the database?`);
  } catch (err) {
    fail(`connection failed: ${(err as Error).message}`);
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  const pooled = process.env.DATABASE_URL;
  const direct = process.env.DATABASE_URL_DIRECT;

  if (!pooled && !direct) {
    console.error('Error: set DATABASE_URL and/or DATABASE_URL_DIRECT (see .env.example).');
    process.exit(1);
  }

  console.log('PostgreSQL health check');
  if (pooled) await checkConnection('Pooled (DATABASE_URL, via PgBouncer)', pooled, false);
  else warn('DATABASE_URL not set — skipping pooled check');
  if (direct) await checkConnection('Direct (DATABASE_URL_DIRECT)', direct, true);
  else warn('DATABASE_URL_DIRECT not set — skipping direct check');

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main();
