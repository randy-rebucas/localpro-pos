import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

const includeLines = {
  lines: { include: { account: { select: { id: true, code: true, name: true, type: true } } } },
  createdBy: { select: { id: true, name: true, email: true } },
} as const;

/**
 * GET - Get a single journal entry with its lines.
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
    const entry = await prisma.journalEntry.findFirst({
      where: { id, tenantId },
      include: includeLines,
    });

    if (!entry) {
      return NextResponse.json(
        { success: false, error: t('validation.journalEntryNotFound', 'Journal entry not found') },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: entry });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Get journal entry error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToFetchJournalEntry', 'Failed to fetch journal entry') },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Delete a manual journal entry. Auto-posted entries (source !==
 * 'manual') are immutable/reversal-only and cannot be deleted this way.
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
    const entry = await prisma.journalEntry.findFirst({ where: { id, tenantId } });
    if (!entry) {
      return NextResponse.json(
        { success: false, error: t('validation.journalEntryNotFound', 'Journal entry not found') },
        { status: 404 }
      );
    }

    if (entry.source !== 'manual') {
      return NextResponse.json(
        {
          success: false,
          error: t(
            'validation.autoPostedEntryImmutable',
            'Auto-posted journal entries cannot be deleted. Post a manual reversing entry instead.'
          ),
        },
        { status: 400 }
      );
    }

    await prisma.journalEntry.update({ where: { id }, data: { isActive: false } });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.DELETE,
      entityType: 'journal_entry',
      entityId: id,
      changes: { softDeleted: true },
    });

    return NextResponse.json({ success: true, message: t('validation.journalEntryDeleted', 'Journal entry deleted successfully') });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Delete journal entry error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToDeleteJournalEntry', 'Failed to delete journal entry') },
      { status: 500 }
    );
  }
}
