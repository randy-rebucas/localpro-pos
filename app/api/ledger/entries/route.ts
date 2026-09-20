import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth, getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { requireLedgerAccess } from '@/lib/ledger-access';
import { validateJournalEntryBalance } from '@/lib/ledger-helpers';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

/**
 * GET - List journal entries for a tenant.
 * Query params: startDate, endDate, source, accountId
 */
export async function GET(request: NextRequest) {
  try {
    let user;
    const t = await getValidationTranslatorFromRequest(request);
    try {
      user = await requireAuth(request);
    } catch {
      return NextResponse.json(
        { success: false, error: t('validation.unauthorized', 'Unauthorized') },
        { status: 401 }
      );
    }

    const tenantId = await getTenantIdFromRequest(request);
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
    }

    if (
      !(await hasTenantPermission(user.role, tenantId, 'ledger.view')) &&
      !(await hasTenantPermission(user.role, tenantId, 'ledger.manage'))
    ) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const source = searchParams.get('source');
    const accountId = searchParams.get('accountId');

    const where: Record<string, unknown> = { tenantId, isActive: { not: false } };
    if (startDate || endDate) {
      where.entryDate = {
        ...(startDate ? { gte: new Date(startDate) } : {}),
        ...(endDate ? { lte: new Date(endDate) } : {}),
      };
    }
    if (source) where.source = source;
    if (accountId) where.lines = { some: { accountId } };

    const entries = await prisma.journalEntry.findMany({
      where,
      include: { lines: { include: { account: { select: { id: true, code: true, name: true, type: true } } } } },
      orderBy: { entryDate: 'desc' },
    });

    return NextResponse.json({ success: true, data: entries });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Get journal entries error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToFetchJournalEntries', 'Failed to fetch journal entries') },
      { status: 500 }
    );
  }
}

/**
 * POST - Create a manual journal entry. Requires >= 2 balanced lines.
 */
export async function POST(request: NextRequest) {
  try {
    const t = await getValidationTranslatorFromRequest(request);

    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: t('validation.unauthorized', 'Unauthorized') },
        { status: 401 }
      );
    }

    const tenantId = await getTenantIdFromRequest(request);
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
    }

    if (!(await hasTenantPermission(user.role, tenantId, 'ledger.manage'))) {
      return NextResponse.json(
        { success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') },
        { status: 403 }
      );
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:ledger:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    try {
      await requireLedgerAccess(tenantId.toString());
    } catch (featureError: unknown) {
      const msg = featureError instanceof Error ? featureError.message : 'Forbidden';
      return NextResponse.json({ success: false, error: msg }, { status: 403 });
    }

    const body = await request.json();
    const { entryDate, memo, branchId, lines } = body;

    if (!Array.isArray(lines) || lines.length < 2) {
      return NextResponse.json(
        { success: false, error: t('validation.journalEntryNeedsTwoLines', 'A journal entry requires at least two lines') },
        { status: 400 }
      );
    }

    try {
      validateJournalEntryBalance(lines);
    } catch (validationError: unknown) {
      const msg = validationError instanceof Error ? validationError.message : 'Journal entry is not balanced';
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }

    const accountIds = [...new Set(lines.map((l: { accountId: string }) => l.accountId))];
    const accounts = await prisma.ledgerAccount.findMany({ where: { id: { in: accountIds }, tenantId } });
    if (accounts.length !== accountIds.length) {
      return NextResponse.json(
        { success: false, error: t('validation.invalidLedgerAccountReference', 'One or more lines reference an account that does not belong to this tenant') },
        { status: 400 }
      );
    }

    if (branchId) {
      const branch = await prisma.branch.findFirst({ where: { id: branchId, tenantId } });
      if (!branch) {
        return NextResponse.json(
          { success: false, error: t('validation.branchNotFound', 'Branch not found') },
          { status: 404 }
        );
      }
    }

    const entry = await prisma.journalEntry.create({
      data: {
        id: randomUUID(),
        tenantId,
        branchId: branchId || undefined,
        entryDate: entryDate ? new Date(entryDate) : new Date(),
        memo: memo || undefined,
        source: 'manual',
        createdById: user.userId,
        lines: {
          create: lines.map((l: { accountId: string; debit?: number; credit?: number; description?: string }) => ({
            id: randomUUID(),
            accountId: l.accountId,
            debit: l.debit || 0,
            credit: l.credit || 0,
            description: l.description || undefined,
          })),
        },
      },
      include: { lines: { include: { account: { select: { id: true, code: true, name: true, type: true } } } } },
    });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.CREATE,
      entityType: 'journal_entry',
      entityId: entry.id,
      changes: { memo, lineCount: lines.length },
    });

    return NextResponse.json({ success: true, data: entry }, { status: 201 });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Create journal entry error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToCreateJournalEntry', 'Failed to create journal entry') },
      { status: 500 }
    );
  }
}
