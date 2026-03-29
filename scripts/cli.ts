#!/usr/bin/env tsx
/**
 * localpro-pos — Unified CLI
 *
 * Single entry point for all operational scripts.
 *
 * Usage:
 *   npx tsx scripts/cli.ts <command> [args...]
 *   npm run cli <command> [args...]
 *
 * Commands:
 *   health                     Run system health check
 *   health --verbose           Verbose health check
 *
 *   tenant:create [slug] [name] [opts]   Create a new tenant (interactive if no args)
 *   tenant:default                        Create the default tenant
 *   tenant:set-plan <slug> <plan-tier>    Assign a subscription plan to a tenant
 *
 *   user:admin <slug> <email> <pass> [name]   Create an admin user for a tenant
 *   user:super-admin --email <e> --password <p> [--name <n>]   Create super-admin
 *
 *   plans:seed                 Seed subscription plans (Basic/Standard/Premium/Enterprise)
 *   seed                       Seed sample data for all business types
 *   defaults [--tenant <slug>] Apply business-type defaults to tenants
 *
 *   reset [opts]               Reset database collections
 *     --all                    Reset all collections
 *     --tenant=<slug>          Reset a specific tenant's data
 *     --collection=<name>      Reset specific collection(s)
 *     --force                  Skip confirmation prompt
 *
 *   test:automations           Test all automation endpoints (requires running server)
 *   test:customer-auth         Test customer OTP auth flow interactively
 *   check:alignment            Verify TEST_CHECKLIST.md ↔ test file alignment
 *
 *   help                       Show this message
 */

import { spawn } from 'child_process';
import { join } from 'path';

// ── Command → script file mapping ────────────────────────────────────────────

const SCRIPTS_DIR = join(__dirname);

const COMMAND_MAP: Record<string, string> = {
  'health':             join(SCRIPTS_DIR, 'health-check.ts'),
  'tenant:create':      join(SCRIPTS_DIR, 'create-tenant.ts'),
  'tenant:default':     join(SCRIPTS_DIR, 'create-default-tenant.ts'),
  'tenant:set-plan':    join(SCRIPTS_DIR, 'set-tenant-plan.ts'),
  'user:admin':         join(SCRIPTS_DIR, 'create-admin-user.ts'),
  'user:super-admin':   join(SCRIPTS_DIR, 'create-super-admin.ts'),
  'plans:seed':         join(SCRIPTS_DIR, 'create-subscription-plans.ts'),
  'seed':               join(SCRIPTS_DIR, 'seed-sample-data.ts'),
  'defaults':           join(SCRIPTS_DIR, 'apply-business-type-defaults.ts'),
  'reset':              join(SCRIPTS_DIR, 'reset-collections.ts'),
  'test:automations':   join(SCRIPTS_DIR, 'test-automations.ts'),
  'test:customer-auth': join(SCRIPTS_DIR, 'test-customer-auth.ts'),
  'check:alignment':    join(SCRIPTS_DIR, 'check-alignment.ts'),
};

// ── Colours ───────────────────────────────────────────────────────────────────

const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
};

// ── Help ──────────────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`
${c.bold}localpro-pos CLI${c.reset}

${c.cyan}Usage:${c.reset}
  npm run cli <command> [args...]
  npx tsx scripts/cli.ts <command> [args...]

${c.cyan}System:${c.reset}
  ${c.bold}health${c.reset}                          Run system health check
  ${c.bold}health --verbose${c.reset}                 Verbose health check output
  ${c.bold}check:alignment${c.reset}                 Verify checklist ↔ test file alignment

${c.cyan}Tenants:${c.reset}
  ${c.bold}tenant:create${c.reset}                   Create a new tenant (interactive)
  ${c.bold}tenant:create <slug> <name>${c.reset}      Create a tenant with given slug/name
  ${c.bold}tenant:default${c.reset}                  Create the default tenant
  ${c.bold}tenant:set-plan <slug> <tier>${c.reset}    Assign a subscription plan to a tenant

${c.cyan}Users:${c.reset}
  ${c.bold}user:admin <slug> <email> <pass>${c.reset}              Create admin user for a tenant
  ${c.bold}user:super-admin --email <e> --password <p>${c.reset}   Create super-admin user

${c.cyan}Data:${c.reset}
  ${c.bold}plans:seed${c.reset}                      Seed subscription plans
  ${c.bold}seed${c.reset}                            Seed sample data for all business types
  ${c.bold}defaults${c.reset}                        Apply business-type defaults (all tenants)
  ${c.bold}defaults --tenant <slug>${c.reset}         Apply defaults to a specific tenant

${c.cyan}Database:${c.reset}
  ${c.bold}reset --all${c.reset}                     Reset all collections
  ${c.bold}reset --tenant=<slug>${c.reset}            Reset a specific tenant's data
  ${c.bold}reset --collection=<name>${c.reset}        Reset specific collection(s)
  ${c.bold}reset --all --force${c.reset}              Reset without confirmation prompt

${c.cyan}Testing:${c.reset}
  ${c.bold}test:automations${c.reset}                Test all automation endpoints (server must be running)
  ${c.bold}test:customer-auth${c.reset}              Test customer OTP auth flow interactively

${c.dim}Run any command with --help for its own usage details.${c.reset}
`);
}

// ── Runner ────────────────────────────────────────────────────────────────────

function runScript(scriptPath: string, args: string[]): void {
  const child = spawn('npx', ['tsx', scriptPath, ...args], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  child.on('close', (code) => {
    process.exit(code ?? 0);
  });

  child.on('error', (err) => {
    console.error(`${c.red}Failed to start script: ${err.message}${c.reset}`);
    process.exit(1);
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main(): void {
  const [, , command, ...rest] = process.argv;

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    process.exit(0);
  }

  const scriptPath = COMMAND_MAP[command];

  if (!scriptPath) {
    console.error(`\n${c.red}Unknown command: ${c.bold}${command}${c.reset}`);
    console.error(`${c.dim}Run ${c.reset}${c.bold}npm run cli help${c.reset}${c.dim} to see available commands.${c.reset}\n`);
    process.exit(1);
  }

  runScript(scriptPath, rest);
}

main();
