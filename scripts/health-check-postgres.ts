#!/usr/bin/env tsx
/**
 * 1POS — System Health Check (PostgreSQL)
 *
 * Usage:
 *   npx tsx scripts/health-check-postgres.ts
 *   npx tsx scripts/health-check-postgres.ts --verbose
 *   npm run health:check:postgres
 *
 * Exit codes:
 *   0  All checks passed
 *   1  One or more checks failed
 */

import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

import prisma from '../lib/prisma';

const VERBOSE = process.argv.includes('--verbose');

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  grey: '\x1b[90m',
};

const pass = (msg: string) => console.log(`  ${c.green}✔${c.reset}  ${msg}`);
const fail = (msg: string) => console.log(`  ${c.red}✘${c.reset}  ${msg}`);
const warn = (msg: string) => console.log(`  ${c.yellow}⚠${c.reset}  ${msg}`);
const info = (msg: string) => VERBOSE && console.log(`  ${c.grey}ℹ${c.reset}  ${c.grey}${msg}${c.reset}`);
const sep = () => console.log('');
const title = (msg: string) => console.log(`\n${c.bold}${c.cyan}${msg}${c.reset}`);

type CheckResult = { label: string; ok: boolean; detail?: string };

async function safe<T>(fn: () => Promise<T>): Promise<{ ok: boolean; value?: T; error?: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return { ok: false, error: err?.message ?? String(err) };
  }
}

// ── 1. Environment ───────────────────────────────────────────────────────
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
    if (process.env[key]) pass(`${key} is set`);
    else warn(`${key} not set (recommended)`);
    results.push({ label: key, ok: true });
  }

  return results;
}

// ── 2. Database connection ───────────────────────────────────────────────
async function checkDatabase(): Promise<CheckResult[]> {
  title('2. Database Connection');
  const result = await safe(() => prisma.$queryRaw`SELECT current_database() as db`);
  if (result.ok) {
    const dbName = (result.value as any[])[0]?.db ?? '(unknown)';
    pass(`Connected to PostgreSQL`);
    pass(`Database name: ${dbName}`);
    return [{ label: 'postgres', ok: true }];
  }
  fail(`Cannot connect to PostgreSQL: ${result.error}`);
  return [{ label: 'postgres', ok: false, detail: result.error }];
}

// ── 3. Table counts ──────────────────────────────────────────────────────
async function checkTables(): Promise<CheckResult[]> {
  title('3. Table Counts');
  const counts: [string, () => Promise<number>][] = [
    ['Tenants', () => prisma.tenant.count()],
    ['Users', () => prisma.user.count()],
    ['Products', () => prisma.product.count()],
    ['Categories', () => prisma.category.count()],
    ['Transactions', () => prisma.transaction.count()],
    ['Branches', () => prisma.branch.count()],
    ['Customers', () => prisma.customer.count()],
    ['Subscriptions', () => prisma.subscription.count()],
    ['SubscriptionPlans', () => prisma.subscriptionPlan.count()],
    ['AuditLogs', () => prisma.auditLog.count()],
  ];

  const results: CheckResult[] = [];
  for (const [label, fn] of counts) {
    const r = await safe(fn);
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

// ── 4. Tenant integrity ──────────────────────────────────────────────────
async function checkTenants(): Promise<CheckResult[]> {
  title('4. Tenant Integrity');
  const results: CheckResult[] = [];

  const tenantsResult = await safe(() => prisma.tenant.findMany({ where: { isActive: true }, select: { id: true, slug: true, name: true } }));
  if (!tenantsResult.ok || !tenantsResult.value) {
    fail(`Could not query tenants: ${tenantsResult.error}`);
    return [{ label: 'tenants', ok: false, detail: tenantsResult.error }];
  }

  const tenants = tenantsResult.value;
  if (tenants.length === 0) {
    warn('No active tenants found');
    return [{ label: 'active-tenants', ok: false, detail: 'no active tenants' }];
  }
  pass(`${tenants.length} active tenant${tenants.length !== 1 ? 's' : ''} found`);

  for (const tenant of tenants) {
    const [userCount, adminCount, productCount, branchCount] = await Promise.all([
      prisma.user.count({ where: { tenantId: tenant.id, isActive: true } }),
      prisma.user.count({ where: { tenantId: tenant.id, role: { in: ['admin', 'owner'] }, isActive: true } }),
      prisma.product.count({ where: { tenantId: tenant.id } }),
      prisma.branch.count({ where: { tenantId: tenant.id } }),
    ]);

    const slug = tenant.slug.padEnd(20);
    if (userCount === 0) {
      fail(`[${slug}] "${tenant.name}" — no active users`);
      results.push({ label: `tenant:${tenant.slug}`, ok: false, detail: 'no active users' });
    } else if (adminCount === 0) {
      warn(`[${slug}] "${tenant.name}" — ${userCount} user(s), no admin/owner`);
      results.push({ label: `tenant:${tenant.slug}`, ok: true });
    } else {
      pass(`[${slug}] "${tenant.name}" — ${userCount} user(s), ${adminCount} admin(s), ${productCount} product(s), ${branchCount} branch(es)`);
      results.push({ label: `tenant:${tenant.slug}`, ok: true });
    }
  }
  return results;
}

// ── 5. Subscription plans ────────────────────────────────────────────────
async function checkSubscriptionPlans(): Promise<CheckResult[]> {
  title('5. Subscription Plans');
  const results: CheckResult[] = [];
  const expectedTiers = ['starter', 'pro', 'business', 'enterprise'];

  const plansResult = await safe(() => prisma.subscriptionPlan.findMany({ where: { isActive: true } }));
  if (!plansResult.ok) {
    fail(`Could not query plans: ${plansResult.error}`);
    return [{ label: 'subscription-plans', ok: false, detail: plansResult.error }];
  }

  const plans = plansResult.value ?? [];
  if (plans.length === 0) {
    warn('No active subscription plans');
    return [{ label: 'subscription-plans', ok: false, detail: 'no plans seeded' }];
  }

  for (const tier of expectedTiers) {
    const plan = plans.find((p) => p.tier === tier);
    if (plan) {
      pass(`${tier.padEnd(12)} — ${plan.name} (${plan.priceCurrency} ${Number(plan.priceMonthly).toFixed(2)}/mo)`);
      results.push({ label: `plan:${tier}`, ok: true });
    } else {
      warn(`${tier} plan missing`);
      results.push({ label: `plan:${tier}`, ok: false, detail: 'missing plan tier' });
    }
  }
  return results;
}

// ── 6. Subscriptions ─────────────────────────────────────────────────────
async function checkSubscriptions(): Promise<CheckResult[]> {
  title('6. Tenant Subscriptions');
  const [activeSubs, trialSubs, expiredSubs] = await Promise.all([
    prisma.subscription.count({ where: { status: 'active' } }),
    prisma.subscription.count({ where: { status: 'trial' } }),
    prisma.subscription.count({ where: { status: { in: ['cancelled', 'suspended'] } } }),
  ]);

  if (activeSubs > 0 || trialSubs > 0) {
    pass(`Active: ${activeSubs}  |  Trial: ${trialSubs}  |  Cancelled/Suspended: ${expiredSubs}`);
  } else {
    warn(`No active or trial subscriptions (${expiredSubs} cancelled/suspended)`);
  }
  return [{ label: 'subscriptions', ok: true }];
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${c.bold}${c.cyan}╔══════════════════════════════════════════════╗`);
  console.log(`║   1POS — System Health Check (PostgreSQL)     ║`);
  console.log(`╚══════════════════════════════════════════════╝${c.reset}`);
  console.log(`  ${c.grey}${new Date().toISOString()}${c.reset}`);
  if (VERBOSE) console.log(`  ${c.grey}verbose mode on${c.reset}`);

  const allResults: CheckResult[] = [];

  allResults.push(...checkEnvironment());

  const dbResults = await checkDatabase();
  allResults.push(...dbResults);
  const dbConnected = dbResults.every((r) => r.ok);

  if (dbConnected) {
    allResults.push(...(await checkTables()));
    allResults.push(...(await checkTenants()));
    allResults.push(...(await checkSubscriptionPlans()));
    allResults.push(...(await checkSubscriptions()));
  } else {
    warn('Skipping DB-dependent checks (no connection)');
  }

  sep();
  const failed = allResults.filter((r) => !r.ok);
  const passed = allResults.filter((r) => r.ok);

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
  await prisma.$disconnect();
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(`\n${c.red}Fatal error:${c.reset}`, err);
  await prisma.$disconnect();
  process.exit(1);
});
