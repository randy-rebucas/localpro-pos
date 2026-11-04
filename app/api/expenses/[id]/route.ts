import { NextRequest, NextResponse } from 'next/server';
import { getRepos } from '@/lib/db';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId } = authResult;
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    const expense = await getRepos().expenses.findByIdWithUser(tenantId, id);

    if (!expense) {
      return NextResponse.json({ success: false, error: t('validation.expenseNotFound', 'Expense not found') }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: expense });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch expense');
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId } = authResult;
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    if (!(await hasTenantPermission(authResult.user.role, authResult.tenantId, 'expenses.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:expenses:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    const body = await request.json();
    const { name, description, amount, date, paymentMethod, receipt, notes } = body;

    const result = await getRepos().expenses.update(tenantId, id, {
      name: name ? name : undefined,
      description: description ? description : undefined,
      amount: amount !== undefined ? parseFloat(amount) : undefined,
      date: date ? new Date(date) : undefined,
      paymentMethod: paymentMethod ? paymentMethod : undefined,
      receipt: receipt !== undefined ? receipt : undefined,
      notes: notes !== undefined ? notes : undefined,
    });
    if (!result) {
      return NextResponse.json({ success: false, error: t('validation.expenseNotFound', 'Expense not found') }, { status: 404 });
    }
    const expense = result.after;

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'expense',
      entityId: expense._id,
      changes: { before: result.before, after: result.after },
    });

    return NextResponse.json({ success: true, data: expense });
  } catch (error) {
    return handleApiError(error, 'Failed to update expense');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId } = authResult;
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    if (!(await hasTenantPermission(authResult.user.role, authResult.tenantId, 'expenses.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:expenses:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    const expense = await getRepos().expenses.softDelete(tenantId, id);
    if (!expense) {
      return NextResponse.json({ success: false, error: t('validation.expenseNotFound', 'Expense not found') }, { status: 404 });
    }

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.DELETE,
      entityType: 'expense',
      entityId: expense._id,
      changes: { name: expense.name, description: expense.description, amount: expense.amount, softDeleted: true },
    });

    return NextResponse.json({ success: true, message: t('validation.expenseDeleted', 'Expense deleted successfully') });
  } catch (error) {
    return handleApiError(error, 'Failed to delete expense');
  }
}

