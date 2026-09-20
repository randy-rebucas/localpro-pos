import { randomUUID } from 'crypto';
import prisma from '@/lib/db';
import { logger } from '@/lib/logger';
import { SYSTEM_ACCOUNTS } from './system-accounts';

/**
 * Creates the standard chart of accounts for a tenant. Idempotent — skips
 * any code that already exists for the tenant (via LedgerAccount's
 * @@unique([tenantId, code])). Safe to call repeatedly (e.g. lazily from
 * GET /api/ledger/accounts) and from new-tenant provisioning scripts.
 */
export async function seedChartOfAccounts(tenantId: string): Promise<void> {
  const existing = await prisma.ledgerAccount.findMany({
    where: { tenantId, code: { in: SYSTEM_ACCOUNTS.map((a) => a.code) } },
    select: { code: true },
  });
  const existingCodes = new Set(existing.map((a) => a.code));

  const toCreate = SYSTEM_ACCOUNTS.filter((a) => !existingCodes.has(a.code));
  if (toCreate.length === 0) return;

  try {
    await prisma.ledgerAccount.createMany({
      data: toCreate.map((a) => ({
        id: randomUUID(),
        tenantId,
        code: a.code,
        name: a.name,
        type: a.type,
        isSystemAccount: true,
        isActive: true,
      })),
      skipDuplicates: true,
    });
  } catch (error) {
    logger.error('Failed to seed chart of accounts', { tenantId, error });
    throw error;
  }
}

/**
 * Ensures a tenant has a chart of accounts, seeding it if empty. Intended
 * for lazy on-demand seeding (e.g. first GET /api/ledger/accounts call)
 * so existing tenants get a COA without a backfill script.
 */
export async function ensureChartOfAccounts(tenantId: string): Promise<void> {
  const count = await prisma.ledgerAccount.count({ where: { tenantId } });
  if (count === 0) {
    await seedChartOfAccounts(tenantId);
  }
}
