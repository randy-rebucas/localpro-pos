#!/usr/bin/env tsx
/**
 * 1POS — System Health Check
 *
 * Verifies environment, database connectivity, table integrity,
 * tenant status, and subscription plan seeds.
 *
 * Usage:
 *   npx tsx scripts/health-check.ts
 *   npx tsx scripts/health-check.ts --verbose
 *   npm run health:check
 *
 * Exit codes:
 *   0  All checks passed
 *   1  One or more checks failed
 */

import '../lib/script-runtime';

import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

import prisma from '../lib/db';

// ── Config ──────────────────────────────────────────────────────────────────
const VERBOSE = process.argv.includes('--verbose');

// ── Colours ─────────────────────────────────────────────────────────────────
const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  grey:   '\x1b[90m',
};

const pass  = (msg: string) => console.log(`  ${c.green}✔${c.reset}  ${msg}`);
const fail  = (msg: string) => console.log(`  ${c.red}✘${c.reset}  ${msg}`);
const warn  = (msg: string) => console.log(`  ${c.yellow}⚠${c.reset}  ${msg}`);
const info  = (msg: string) => VERBOSE && console.log(`  ${c.grey}ℹ${c.reset}  ${c.grey}${msg}${c.reset}`);
const sep   = ()            => console.log('');
const title = (msg: string) => console.log(`\n${c.bold}${c.cyan}${msg}${c.reset}`);

// ── Helpers ──────────────────────────────────────────────────────────────────
type CheckResult = { label: string; ok: boolean; detail?: string };

async function safe<T>(
  label: string,
  fn: () => Promise<T>
): Promise<{ ok: boolean; value?: T; error?: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return { ok: false, error: err?.message ?? String(err) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Section 1 — Environment Variables
// ═══════════════════════════════════════════════════════════════════════════
function checkEnvironment(): CheckResult[] {
  title('1. Environment Variables');

  const required = ['DATABASE_URL', 'JWT_SECRET'];
  const recommended = ['CRON_SECRET', 'NEXT_PUBLIC_APP_URL'];

  const results: CheckResult[] = [];

  for (const key of required) {
    const val = process.env[key];
    if (val) {
      pass(`${key} is set`);
      info(`  → ${val.slice(0, 20)}…`);
      results.push({ label: key, ok: true });
    } else {
      fail(`${key} is NOT set (required)`);
      results.push({ label: key, ok: false, detail: 'missing required env var' });
    }
  }

  for (const key of recommended) {
    const val = process.env[key];
    if (val) {
      pass(`${key} is set`);
    } else {
      warn(`${key} not set (recommended)`);
    }
    results.push({ label: key, ok: true }); // warnings don't fail the check
  }

  // JWT_SECRET strength check
  const jwtSecret = process.env.JWT_SECRET ?? '';
  if (jwtSecret && jwtSecret.length < 32) {
    warn('JWT_SECRET is shorter than 32 chars — consider using a stronger secret');
  }

  // Dev-only insecure default detection
  if (jwtSecret === 'dev-only-insecure-secret-do-not-use-in-production') {
    warn('JWT_SECRET is using the insecure development default');
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Section 2 — Database Connection
// ═══════════════════════════════════════════════════════════════════════════
async function checkDatabase(): Promise<CheckResult[]> {
  title('2. Database Connection');

  const result = await safe('postgres connect', () => prisma.$queryRaw`SELECT current_database() as db`);

  if (result.ok) {
    const rows = result.value as { db: string }[];
    const dbName = rows?.[0]?.db ?? '(unknown)';
    const dbUrl = process.env.DATABASE_URL ?? '';
    pass(`Connected to Postgres  →  ${c.grey}${dbUrl.replace(/\/\/[^@]+@/, '//<credentials>@')}${c.reset}`);
    pass(`Database name: ${dbName}`);
    return [{ label: 'postgres', ok: true }];
  } else {
    fail(`Cannot connect to Postgres: ${result.error}`);
    return [{ label: 'postgres', ok: false, detail: result.error }];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Section 3 — Table Counts
// ═══════════════════════════════════════════════════════════════════════════
async function checkCollections(): Promise<CheckResult[]> {
  title('3. Table Counts');

  const counters: [string, () => Promise<number>][] = [
    ['Tenants',           () => prisma.tenant.count()],
    ['Users',             () => prisma.user.count()],
    ['Products',          () => prisma.product.count()],
    ['Categories',        () => prisma.category.count()],
    ['Transactions',      () => prisma.transaction.count()],
    ['Branches',          () => prisma.branch.count()],
    ['Customers',         () => prisma.customer.count()],
    ['Subscriptions',     () => prisma.subscription.count()],
    ['SubscriptionPlans', () => prisma.subscriptionPlan.count()],
    ['AuditLogs',         () => prisma.auditLog.count()],
  ];

  const results: CheckResult[] = [];

  for (const [label, countFn] of counters) {
    const r = await safe(label, countFn);
    if (r.ok) {
      const count = r.value as number;
      pass(`${label.padEnd(18)} ${String(count).padStart(6)} row${count !== 1 ? 's' : ''}`);
      results.push({ label, ok: true });
    } else {
      fail(`${label}: ${r.error}`);
      results.push({ label, ok: false, detail: r.error });
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Section 4 — Tenant Integrity
// ═══════════════════════════════════════════════════════════════════════════
async function checkTenants(): Promise<CheckResult[]> {
  title('4. Tenant Integrity');

  const results: CheckResult[] = [];

  const tenantsResult = await safe('tenants query', () =>
    prisma.tenant.findMany({ where: { isActive: true }, select: { id: true, slug: true, name: true } })
  );

  if (!tenantsResult.ok || !tenantsResult.value) {
    fail(`Could not query tenants: ${tenantsResult.error}`);
    return [{ label: 'tenants', ok: false, detail: tenantsResult.error }];
  }

  const tenants = tenantsResult.value;

  if (tenants.length === 0) {
    warn('No active tenants found — run: npm run tenant:default');
    return [{ label: 'active-tenants', ok: false, detail: 'no active tenants' }];
  }

  pass(`${tenants.length} active tenant${tenants.length !== 1 ? 's' : ''} found`);

  for (const tenant of tenants) {
    const userCount = await prisma.user.count({ where: { tenantId: tenant.id, isActive: true } });
    const adminCount = await prisma.user.count({
      where: { tenantId: tenant.id, role: { in: ['admin', 'owner'] }, isActive: true },
    });
    const productCount = await prisma.product.count({ where: { tenantId: tenant.id } });
    const branchCount = await prisma.branch.count({ where: { tenantId: tenant.id } });

    const slug = String(tenant.slug).padEnd(20);
    const name = String(tenant.name);

    if (userCount === 0) {
      fail(`[${slug}] "${name}" — no active users`);
      results.push({ label: `tenant:${tenant.slug}`, ok: false, detail: 'no active users' });
    } else if (adminCount === 0) {
      warn(`[${slug}] "${name}" — ${userCount} user(s), no admin/owner`);
      results.push({ label: `tenant:${tenant.slug}`, ok: true });
    } else {
      pass(`[${slug}] "${name}" — ${userCount} user(s), ${adminCount} admin(s), ${productCount} product(s), ${branchCount} branch(es)`);
      results.push({ label: `tenant:${tenant.slug}`, ok: true });
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Section 5 — Subscription Plans
// ═══════════════════════════════════════════════════════════════════════════
async function checkSubscriptionPlans(): Promise<CheckResult[]> {
  title('5. Subscription Plans');

  const results: CheckResult[] = [];
  const expectedTiers = ['starter', 'pro', 'business', 'enterprise'];

  const plansResult = await safe('plans query', () =>
    prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      select: { name: true, tier: true, priceMonthly: true, priceCurrency: true },
    })
  );

  if (!plansResult.ok) {
    fail(`Could not query plans: ${plansResult.error}`);
    return [{ label: 'subscription-plans', ok: false, detail: plansResult.error }];
  }

  const plans = plansResult.value ?? [];
  const tiers = plans.map((p) => p.tier);

  if (plans.length === 0) {
    warn('No active subscription plans — run: npm run seed:subscription-plans');
    return [{ label: 'subscription-plans', ok: false, detail: 'no plans seeded' }];
  }

  for (const expected of expectedTiers) {
    if (tiers.includes(expected as (typeof tiers)[number])) {
      const plan = plans.find((p) => p.tier === expected);
      const planName     = plan?.name     ?? expected;
      const planCurrency = plan?.priceCurrency ?? '?';
      const planPrice    = Number(plan?.priceMonthly ?? 0).toFixed(2);
      pass(`${expected.padEnd(12)} — ${planName} (${planCurrency} ${planPrice}/mo)`);
      results.push({ label: `plan:${expected}`, ok: true });
    } else {
      warn(`${expected} plan missing — run: npm run seed:subscription-plans`);
      results.push({ label: `plan:${expected}`, ok: false, detail: 'missing plan tier' });
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Section 6 — Active Subscriptions
// ═══════════════════════════════════════════════════════════════════════════
async function checkSubscriptions(): Promise<CheckResult[]> {
  title('6. Tenant Subscriptions');

  const activeSubs = await prisma.subscription.count({ where: { status: 'active' } });
  const trialSubs  = await prisma.subscription.count({ where: { status: 'trial' } });
  const expiredSubs = await prisma.subscription.count({ where: { status: { in: ['cancelled', 'suspended'] } } });

  if (activeSubs > 0 || trialSubs > 0) {
    pass(`Active: ${activeSubs}  |  Trial: ${trialSubs}  |  Cancelled/Suspended: ${expiredSubs}`);
  } else {
    warn(`No active or trial subscriptions (${expiredSubs} cancelled/suspended)`);
  }

  return [{ label: 'subscriptions', ok: true }];
}

// ═══════════════════════════════════════════════════════════════════════════
//  Main
// ═══════════════════════════════════════════════════════════════════════════
async function main() {
  console.log(`\n${c.bold}${c.cyan}╔══════════════════════════════════════════╗`);
  console.log(`║   1POS — System Health Check    ║`);
  console.log(`╚══════════════════════════════════════════╝${c.reset}`);
  console.log(`  ${c.grey}${new Date().toISOString()}${c.reset}`);
  if (VERBOSE) console.log(`  ${c.grey}verbose mode on${c.reset}`);

  const allResults: CheckResult[] = [];
  let dbConnected = false;

  // 1. Env (no DB needed)
  allResults.push(...checkEnvironment());

  // 2. Database
  const dbResults = await checkDatabase();
  allResults.push(...dbResults);
  dbConnected = dbResults.every(r => r.ok);

  if (dbConnected) {
    // 3–6 require DB
    allResults.push(...await checkCollections());
    allResults.push(...await checkTenants());
    allResults.push(...await checkSubscriptionPlans());
    allResults.push(...await checkSubscriptions());
  } else {
    warn('Skipping DB-dependent checks (no connection)');
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  sep();
  const failed = allResults.filter(r => !r.ok);
  const passed = allResults.filter(r => r.ok);

  console.log(`${c.bold}Summary${c.reset}`);
  console.log(`  ${c.green}Passed: ${passed.length}${c.reset}   ${failed.length > 0 ? c.red : c.grey}Failed: ${failed.length}${c.reset}`);

  if (failed.length > 0) {
    sep();
    console.log(`${c.bold}${c.red}Issues to resolve:${c.reset}`);
    for (const r of failed) {
      console.log(`  ${c.red}✘${c.reset}  ${r.label}${r.detail ? `  →  ${c.grey}${r.detail}${c.reset}` : ''}`);
    }
  }

  sep();

  process.exit(failed.length > 0 ? 1 : 0);
}

main()
  .catch(err => {
    console.error(`\n${c.red}Fatal error:${c.reset}`, err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
