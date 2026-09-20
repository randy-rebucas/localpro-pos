import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

/**
 * GET - Get a single ledger account by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    const t = await getValidationTranslatorFromRequest(request);
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

    if (
      !(await hasTenantPermission(user.role, tenantId, 'ledger.view')) &&
      !(await hasTenantPermission(user.role, tenantId, 'ledger.manage'))
    ) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const { id } = await params;
    const account = await prisma.ledgerAccount.findFirst({ where: { id, tenantId } });

    if (!account) {
      return NextResponse.json(
        { success: false, error: t('validation.ledgerAccountNotFound', 'Ledger account not found') },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: account });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Get ledger account error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToFetchLedgerAccount', 'Failed to fetch ledger account') },
      { status: 500 }
    );
  }
}

/**
 * PATCH - Rename/deactivate a ledger account. System accounts cannot have
 * their code or type changed (auto-posting depends on those staying stable).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    const t = await getValidationTranslatorFromRequest(request);
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
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:ledger:${tenantId}:${ip}`, 60, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    const { id } = await params;
    const existing = await prisma.ledgerAccount.findFirst({ where: { id, tenantId } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: t('validation.ledgerAccountNotFound', 'Ledger account not found') },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { name, type, code, isActive } = body;

    if (existing.isSystemAccount && ((code !== undefined && code !== existing.code) || (type !== undefined && type !== existing.type))) {
      return NextResponse.json(
        { success: false, error: t('validation.systemAccountImmutable', 'The code and type of a system account cannot be changed') },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (!existing.isSystemAccount) {
      if (type !== undefined) updateData.type = type;
      if (code !== undefined) updateData.code = code;
    }

    const updated = await prisma.ledgerAccount.update({ where: { id }, data: updateData });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'ledger_account',
      entityId: id,
      changes: updateData,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Update ledger account error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToUpdateLedgerAccount', 'Failed to update ledger account') },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Soft-delete a ledger account. Blocked for system accounts and
 * for any account that already has journal lines posted against it.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    const t = await getValidationTranslatorFromRequest(request);
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
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const { id } = await params;
    const account = await prisma.ledgerAccount.findFirst({ where: { id, tenantId } });
    if (!account) {
      return NextResponse.json(
        { success: false, error: t('validation.ledgerAccountNotFound', 'Ledger account not found') },
        { status: 404 }
      );
    }

    if (account.isSystemAccount) {
      return NextResponse.json(
        { success: false, error: t('validation.systemAccountUndeletable', 'System accounts cannot be deleted') },
        { status: 400 }
      );
    }

    const lineCount = await prisma.journalLine.count({ where: { accountId: id } });
    if (lineCount > 0) {
      return NextResponse.json(
        { success: false, error: t('validation.accountHasJournalLines', 'This account has journal lines posted against it and cannot be deleted') },
        { status: 400 }
      );
    }

    await prisma.ledgerAccount.update({ where: { id }, data: { isActive: false } });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.DELETE,
      entityType: 'ledger_account',
      entityId: id,
      changes: { softDeleted: true },
    });

    return NextResponse.json({ success: true, message: t('validation.ledgerAccountDeleted', 'Ledger account deactivated successfully') });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Delete ledger account error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToDeleteLedgerAccount', 'Failed to delete ledger account') },
      { status: 500 }
    );
  }
}
