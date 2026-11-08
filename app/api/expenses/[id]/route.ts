import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Expense from '@/models/Expense';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { getTenantSettingsById } from '@/lib/tenant';
import { expenseDateFromInput } from '@/lib/expense-date';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId } = authResult;
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    const expense = await Expense.findOne({ _id: id, tenantId })
      .populate('userId', 'name email')
      .lean();

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
    await connectDB();
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

    // Deleted (soft) expenses are not edited back into the totals
    const expense = await Expense.findOne({ _id: id, tenantId, isActive: { $ne: false } });
    if (!expense) {
      return NextResponse.json({ success: false, error: t('validation.expenseNotFound', 'Expense not found') }, { status: 404 });
    }

    const body = await request.json();
    const { name, description, amount, date, paymentMethod, receipt, notes } = body;

    const oldData = expense.toObject();

    if (amount !== undefined) {
      const amountValue = typeof amount === 'number' ? amount : parseFloat(amount);
      if (!Number.isFinite(amountValue) || amountValue < 0) {
        return NextResponse.json(
          { success: false, error: t('validation.amountPositive', 'Amount must be a valid positive number') },
          { status: 400 }
        );
      }
      expense.amount = Math.round(amountValue * 100) / 100;
    }
    if (date) {
      const parsed = expenseDateFromInput(date, (await getTenantSettingsById(tenantId))?.timezone);
      if (!parsed) {
        return NextResponse.json({ success: false, error: t('validation.invalidDate', 'Invalid date') }, { status: 400 });
      }
      expense.date = parsed;
    }
    if (typeof name === 'string' && name.trim()) expense.name = name.trim();
    if (typeof description === 'string' && description.trim()) expense.description = description.trim();
    if (paymentMethod) expense.paymentMethod = paymentMethod;
    if (receipt !== undefined) expense.receipt = receipt;
    if (notes !== undefined) expense.notes = notes;

    await expense.save();

    await createAuditLog(request, {
      tenantId,
      userId: authResult.user.userId,
      action: AuditActions.UPDATE,
      entityType: 'expense',
      entityId: expense._id.toString(),
      changes: { before: oldData, after: expense.toObject() },
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
    await connectDB();
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

    const expense = await Expense.findOneAndUpdate(
      { _id: id, tenantId, isActive: true },
      { isActive: false },
      { new: true }
    );
    if (!expense) {
      return NextResponse.json({ success: false, error: t('validation.expenseNotFound', 'Expense not found') }, { status: 404 });
    }

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.DELETE,
      entityType: 'expense',
      entityId: expense._id.toString(),
      changes: { name: expense.name, description: expense.description, amount: expense.amount, softDeleted: true },
    });

    return NextResponse.json({ success: true, message: t('validation.expenseDeleted', 'Expense deleted successfully') });
  } catch (error) {
    return handleApiError(error, 'Failed to delete expense');
  }
}

