import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth, getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { requireLedgerAccess } from '@/lib/ledger-access';
import { ensureChartOfAccounts } from '@/lib/accounting/seed-chart-of-accounts';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'];

/**
 * GET - List the tenant's chart of accounts. Lazily seeds the default
 * system accounts on first access.
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

    try {
      await ensureChartOfAccounts(tenantId.toString());
    } catch (seedError) {
      logger.error('Lazy chart-of-accounts seed failed', seedError);
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const where: Record<string, unknown> = { tenantId };
    if (!includeInactive) where.isActive = { not: false };
    if (type) where.type = type;

    const accounts = await prisma.ledgerAccount.findMany({
      where,
      orderBy: { code: 'asc' },
    });

    return NextResponse.json({ success: true, data: accounts });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Get ledger accounts error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToFetchLedgerAccounts', 'Failed to fetch ledger accounts') },
      { status: 500 }
    );
  }
}

/**
 * POST - Create a custom (non-system) ledger account.
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
    const { code, name, type, parentId } = body;

    if (!code || !name || !type) {
      return NextResponse.json(
        { success: false, error: t('validation.ledgerAccountFieldsRequired', 'Code, name, and type are required') },
        { status: 400 }
      );
    }

    if (!ACCOUNT_TYPES.includes(type)) {
      return NextResponse.json(
        { success: false, error: t('validation.invalidAccountType', 'Invalid account type') },
        { status: 400 }
      );
    }

    if (parentId) {
      const parent = await prisma.ledgerAccount.findFirst({ where: { id: parentId, tenantId } });
      if (!parent) {
        return NextResponse.json(
          { success: false, error: t('validation.parentAccountNotFound', 'Parent account not found') },
          { status: 404 }
        );
      }
    }

    const existing = await prisma.ledgerAccount.findFirst({ where: { tenantId, code } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: t('validation.accountCodeInUse', 'An account with this code already exists') },
        { status: 409 }
      );
    }

    const account = await prisma.ledgerAccount.create({
      data: {
        id: randomUUID(),
        tenantId,
        code,
        name,
        type,
        parentId: parentId || undefined,
        isSystemAccount: false,
      },
    });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.CREATE,
      entityType: 'ledger_account',
      entityId: account.id,
      changes: { code, name, type },
    });

    return NextResponse.json({ success: true, data: account }, { status: 201 });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Create ledger account error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToCreateLedgerAccount', 'Failed to create ledger account') },
      { status: 500 }
    );
  }
}
