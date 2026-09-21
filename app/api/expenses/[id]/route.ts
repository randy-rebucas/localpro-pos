import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { requireExpensesAccess } from '@/lib/expenses-access';

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

    const expense = await prisma.expense.findFirst({
      where: { id, tenantId },
      include: { user: { select: { name: true, email: true } } },
    });

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

    try {
      await requireExpensesAccess(tenantId);
    } catch (featureError: unknown) {
      const msg = featureError instanceof Error ? featureError.message : 'Forbidden';
      return NextResponse.json({ success: false, error: msg }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:expenses:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    const existingExpense = await prisma.expense.findFirst({ where: { id, tenantId } });
    if (!existingExpense) {
      return NextResponse.json({ success: false, error: t('validation.expenseNotFound', 'Expense not found') }, { status: 404 });
    }

    const body = await request.json();
    const { name, description, amount, date, paymentMethod, receipt, notes } = body;

    const data: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any

    if (name) data.name = name;
    if (description) data.description = description;
    if (amount !== undefined) data.amount = parseFloat(amount);
    if (date) data.date = new Date(date);
    if (paymentMethod) data.paymentMethod = paymentMethod;
    if (receipt !== undefined) data.receipt = receipt;
    if (notes !== undefined) data.notes = notes;

    const expense = await prisma.expense.update({
      where: { id, tenantId },
      data,
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'expense',
      entityId: expense.id,
      changes: { before: existingExpense, after: expense },
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

    const { count } = await prisma.expense.updateMany({
      where: { id, tenantId, isActive: true },
      data: { isActive: false },
    });
    if (count === 0) {
      return NextResponse.json({ success: false, error: t('validation.expenseNotFound', 'Expense not found') }, { status: 404 });
    }
    const expense = await prisma.expense.findFirst({ where: { id, tenantId } });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.DELETE,
      entityType: 'expense',
      entityId: id,
      changes: { name: expense?.name, description: expense?.description, amount: expense?.amount, softDeleted: true },
    });

    return NextResponse.json({ success: true, message: t('validation.expenseDeleted', 'Expense deleted successfully') });
  } catch (error) {
    return handleApiError(error, 'Failed to delete expense');
  }
}

