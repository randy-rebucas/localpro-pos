import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { isValidDepositStatusTransition, type DepositStatus } from '@/lib/deposit-helpers';
import { logger } from '@/lib/logger';

const includeRelations = {
  booking: { select: { id: true, serviceName: true, customerName: true, startTime: true } },
  workOrder: { select: { id: true, title: true } },
  customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
  invoice: { select: { id: true, invoiceNumber: true, total: true } },
  recordedBy: { select: { id: true, name: true } },
} as const;

// Transitions that release/withhold the customer's money and therefore
// require the extra deposits.refund permission on top of deposits.manage.
const SENSITIVE_STATUSES: DepositStatus[] = ['refunded', 'forfeited'];

/**
 * GET - Get a single deposit by ID
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
      !(await hasTenantPermission(user.role, tenantId, 'deposits.view')) &&
      !(await hasTenantPermission(user.role, tenantId, 'deposits.manage'))
    ) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const { id } = await params;
    const deposit = await prisma.deposit.findFirst({
      where: { id, tenantId },
      include: includeRelations,
    });

    if (!deposit) {
      return NextResponse.json(
        { success: false, error: t('validation.depositNotFound', 'Deposit not found') },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: deposit });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Get deposit error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToFetchDeposit', 'Failed to fetch deposit') },
      { status: 500 }
    );
  }
}

/**
 * PATCH - Update a deposit: status transitions (pending -> paid -> applied/
 * refunded/forfeited), applying to an invoice, notes.
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

    if (!(await hasTenantPermission(user.role, tenantId, 'deposits.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:deposits:${tenantId}:${ip}`, 60, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    const { id } = await params;
    const existing = await prisma.deposit.findFirst({ where: { id, tenantId } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: t('validation.depositNotFound', 'Deposit not found') },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { status, invoiceId, refundedAmount, notes } = body;

    if (status !== undefined) {
      if (!isValidDepositStatusTransition(existing.status as DepositStatus, status)) {
        return NextResponse.json(
          {
            success: false,
            error: t(
              'validation.invalidDepositStatusTransition',
              'Cannot change deposit status from {from} to {to}'
            )
              .replace('{from}', existing.status)
              .replace('{to}', status),
          },
          { status: 400 }
        );
      }

      if (
        SENSITIVE_STATUSES.includes(status as DepositStatus) &&
        !(await hasTenantPermission(user.role, tenantId, 'deposits.refund'))
      ) {
        return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
      }

      if (status === 'applied' && !invoiceId && !existing.invoiceId) {
        return NextResponse.json(
          { success: false, error: t('validation.depositInvoiceRequired', 'An invoice is required to apply this deposit') },
          { status: 400 }
        );
      }
    }

    if (invoiceId) {
      const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, tenantId } });
      if (!invoice) {
        return NextResponse.json(
          { success: false, error: t('validation.invoiceNotFound', 'Invoice not found') },
          { status: 404 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (status !== undefined) {
      updateData.status = status;
      if (status === 'paid' && !existing.paidAt) updateData.paidAt = new Date();
      if (status === 'applied') updateData.appliedAt = new Date();
      if (status === 'refunded') {
        updateData.refundedAt = new Date();
        updateData.refundedAmount = refundedAmount !== undefined ? Number(refundedAmount) : existing.amount;
      }
    }
    if (invoiceId !== undefined) updateData.invoiceId = invoiceId || null;
    if (notes !== undefined) updateData.notes = notes;

    await prisma.deposit.update({ where: { id }, data: updateData });

    const updated = await prisma.deposit.findUnique({
      where: { id },
      include: includeRelations,
    });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'deposit',
      entityId: id,
      changes: updateData,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Update deposit error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToUpdateDeposit', 'Failed to update deposit') },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Cancel a deposit (only while still pending, before money changes hands)
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

    if (!(await hasTenantPermission(user.role, tenantId, 'deposits.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const { id } = await params;
    const deposit = await prisma.deposit.findFirst({ where: { id, tenantId } });
    if (!deposit) {
      return NextResponse.json(
        { success: false, error: t('validation.depositNotFound', 'Deposit not found') },
        { status: 404 }
      );
    }

    if (deposit.status !== 'pending') {
      return NextResponse.json(
        {
          success: false,
          error: t('validation.depositCannotCancel', 'Only a pending deposit can be cancelled directly'),
        },
        { status: 400 }
      );
    }

    await prisma.deposit.update({ where: { id }, data: { status: 'cancelled' } });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.DELETE,
      entityType: 'deposit',
      entityId: id,
      changes: { softDeleted: true },
    });

    return NextResponse.json({ success: true, message: t('validation.depositCancelled', 'Deposit cancelled successfully') });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Delete deposit error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToDeleteDeposit', 'Failed to delete deposit') },
      { status: 500 }
    );
  }
}
