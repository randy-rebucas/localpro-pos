#!/usr/bin/env tsx
/**
 * check-alignment.ts
 *
 * Verifies that every section in TEST_CHECKLIST.md maps to at least one
 * test file in __tests__/, and that no section is left uncovered.
 *
 * Usage:
 *   pnpm run test:alignment
 *   tsx scripts/check-alignment.ts
 *
 * Exit codes:
 *   0 — all sections covered, no mismatches
 *   1 — one or more sections uncovered or checklist has failing items
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

// ── Config ────────────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '..');
const CHECKLIST = join(ROOT, 'TEST_CHECKLIST.md');
const TESTS_DIR = join(ROOT, '__tests__');

/**
 * Mapping: checklist section number → test file(s) in __tests__/
 * A section is "covered" when at least one of its files exists.
 */
const SECTION_MAP: Record<number, string[]> = {
  1:  ['auth.test.ts', 'api-auth.test.ts'],
  2:  ['api-tenants.test.ts'],
  3:  ['api-users.test.ts'],
  4:  ['api-products.test.ts'],
  5:  ['api-transactions.test.ts', 'api-transactions-refunds.test.ts'],
  6:  ['api-payments-invoices.test.ts', 'api-paypal.test.ts'],
  7:  ['api-customers.test.ts'],
  8:  ['api-inventory.test.ts'],
  9:  ['api-discounts.test.ts'],
  10: ['api-tax-rules.test.ts'],
  11: ['api-bookings.test.ts'],
  12: ['api-cash-drawer.test.ts'],
  13: ['api-expenses.test.ts'],
  14: ['api-saved-carts-loyalty.test.ts'],
  15: ['api-saved-carts-loyalty.test.ts'],
  16: ['api-attendance-branches.test.ts'],
  17: ['api-attendance-branches.test.ts'],
  18: ['api-reports.test.ts'],
  19: ['api-subscriptions.test.ts'],
  20: ['api-super-admin.test.ts'],
  21: ['api-automations.test.ts', 'automation-auth.test.ts'],
  22: ['api-hardware-audit.test.ts'],
  23: ['api-hardware-audit.test.ts'],
  24: ['api-multi-currency.test.ts'],
  25: ['api-tenant-isolation.test.ts'],
  26: ['api-rbac.test.ts'],
  27: ['api-rate-limit.test.ts', 'rate-limit.test.ts'],
  28: ['ui-pos-dashboard.test.ts'],
  29: ['ui-pos-dashboard.test.ts'],
  30: ['ui-pos-dashboard.test.ts'],
  31: ['ui-pos-dashboard.test.ts'],
  32: ['api-pwa-utilities.test.ts'],
  33: ['api-pwa-utilities.test.ts'],
};

// ── Parse TEST_CHECKLIST.md ───────────────────────────────────────────────────

interface ChecklistSection {
  number: number;
  title: string;
  items: { id: string; status: 'pass' | 'fail' | 'skip' | 'todo'; text: string }[];
}

function parseChecklist(filePath: string): ChecklistSection[] {
  const content = readFileSync(filePath, 'utf-8');
  const sections: ChecklistSection[] = [];
  let current: ChecklistSection | null = null;

  for (const line of content.split('\n')) {
    // Match section headers: ## 1. Authentication
    const sectionMatch = line.match(/^## (\d+)\.\s+(.+)/);
    if (sectionMatch) {
      if (current) sections.push(current);
      current = {
        number: parseInt(sectionMatch[1]),
        title: sectionMatch[2].trim(),
        items: [],
      };
      continue;
    }

    // Match table rows: | 1.1 | ... | [x] | |
    if (current && line.startsWith('|')) {
      const cols = line.split('|').map(c => c.trim()).filter(Boolean);
      if (cols.length >= 3 && cols[0].match(/^\d+\.\d+$/)) {
        const id = cols[0];
        const text = cols[1];
        const statusRaw = cols[2];
        let status: 'pass' | 'fail' | 'skip' | 'todo' = 'todo';
        if (statusRaw === '[x]') status = 'pass';
        else if (statusRaw === '[!]') status = 'fail';
        else if (statusRaw === '[-]') status = 'skip';
        current.items.push({ id, status, text });
      }
    }
  }

  if (current) sections.push(current);
  return sections;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const COL = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
  };

  console.log(`\n${COL.bold}╔══════════════════════════════════════════════════════╗${COL.reset}`);
  console.log(`${COL.bold}║       Test–Checklist Alignment Report                ║${COL.reset}`);
  console.log(`${COL.bold}╚══════════════════════════════════════════════════════╝${COL.reset}\n`);

  // Load checklist
  if (!existsSync(CHECKLIST)) {
    console.error(`${COL.red}ERROR: TEST_CHECKLIST.md not found at ${CHECKLIST}${COL.reset}`);
    process.exit(1);
  }

  const sections = parseChecklist(CHECKLIST);
  const testFiles = new Set(readdirSync(TESTS_DIR).filter(f => f.endsWith('.test.ts')));

  let exitCode = 0;
  let totalItems = 0;
  let passItems = 0;
  let failItems = 0;
  let todoItems = 0;
  let coveredSections = 0;
  let uncoveredSections = 0;

  // ── Per-section report ────────────────────────────────────────────────────
  console.log(`${COL.bold}Section Coverage${COL.reset}`);
  console.log('─'.repeat(70));

  for (const section of sections) {
    const mapped = SECTION_MAP[section.number] ?? [];
    const covered = mapped.some(f => testFiles.has(f));
    const existingFiles = mapped.filter(f => testFiles.has(f));
    const missingFiles = mapped.filter(f => !testFiles.has(f));

    const sectionPass = section.items.filter(i => i.status === 'pass').length;
    const sectionFail = section.items.filter(i => i.status === 'fail').length;
    const sectionTodo = section.items.filter(i => i.status === 'todo').length;

    totalItems += section.items.length;
    passItems += sectionPass;
    failItems += sectionFail;
    todoItems += sectionTodo;

    if (covered) {
      coveredSections++;
    } else {
      uncoveredSections++;
      exitCode = 1;
    }

    // Status icon
    const icon = covered
      ? (sectionFail > 0 ? `${COL.red}✗${COL.reset}` : `${COL.green}✓${COL.reset}`)
      : `${COL.yellow}⚠${COL.reset}`;

    const coverageTag = covered
      ? `${COL.green}covered${COL.reset}`
      : `${COL.yellow}NO TEST FILE${COL.reset}`;

    const progress = `${sectionPass}/${section.items.length} pass`;
    const label = `${section.number.toString().padStart(2)}. ${section.title}`;

    console.log(
      `${icon} ${COL.bold}${label.padEnd(40)}${COL.reset}` +
      `  ${coverageTag.padEnd(20)}  ${COL.dim}${progress}${COL.reset}`
    );

    // Show mapped test files
    if (existingFiles.length > 0) {
      for (const f of existingFiles) {
        console.log(`   ${COL.dim}├─ __tests__/${f}${COL.reset}`);
      }
    }
    if (missingFiles.length > 0) {
      for (const f of missingFiles) {
        console.log(`   ${COL.red}✗ MISSING: __tests__/${f}${COL.reset}`);
        exitCode = 1;
      }
    }
    if (sectionFail > 0) {
      console.log(`   ${COL.red}⚠ ${sectionFail} failing checklist item(s)${COL.reset}`);
      exitCode = 1;
    }
    if (sectionTodo > 0) {
      console.log(`   ${COL.yellow}○ ${sectionTodo} untested item(s)${COL.reset}`);
    }
  }

  // ── Unmapped test files ────────────────────────────────────────────────────
  const allMappedFiles = new Set(Object.values(SECTION_MAP).flat());
  const unmappedFiles = [...testFiles].filter(f => !allMappedFiles.has(f));

  console.log('\n' + '─'.repeat(70));
  if (unmappedFiles.length > 0) {
    console.log(`\n${COL.cyan}${COL.bold}Extra test files (not mapped to a section):${COL.reset}`);
    for (const f of unmappedFiles) {
      console.log(`  ${COL.cyan}+ __tests__/${f}${COL.reset}`);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${COL.bold}Summary${COL.reset}`);
  console.log('─'.repeat(70));
  console.log(
    `  Sections   : ${coveredSections} covered` +
    (uncoveredSections > 0 ? `, ${COL.yellow}${uncoveredSections} uncovered${COL.reset}` : `, ${COL.green}0 uncovered${COL.reset}`)
  );
  console.log(
    `  Checklist  : ${COL.green}${passItems} pass${COL.reset}` +
    (failItems > 0 ? ` / ${COL.red}${failItems} fail${COL.reset}` : ' / 0 fail') +
    (todoItems > 0 ? ` / ${COL.yellow}${todoItems} todo${COL.reset}` : '') +
    `  (${totalItems} total)`
  );
  console.log(`  Test files : ${testFiles.size} found in __tests__/`);

  if (exitCode === 0) {
    console.log(`\n${COL.green}${COL.bold}✓ All sections covered. Checklist fully aligned.${COL.reset}\n`);
  } else {
    console.log(`\n${COL.red}${COL.bold}✗ Alignment issues found. See above.${COL.reset}\n`);
  }

  process.exit(exitCode);
}

main();
