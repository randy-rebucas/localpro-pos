import { NextRequest, NextResponse } from 'next/server';
import { LIST_SAFETY_CAP } from '@/lib/query-utils';
import connectDB from '@/lib/mongodb';
import Expense from '@/models/Expense';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { getTenantSettingsById } from '@/lib/tenant';
import { tenantDayEdge } from '@/lib/timezone';
import { expenseDateFromInput } from '@/lib/expense-date';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId } = authResult;

    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const name = searchParams.get('name');

    const query: any = { tenantId, isActive: { $ne: false } }; // eslint-disable-line @typescript-eslint/no-explicit-any

    if (startDate || endDate) {
      // Picked days run from the start of startDate to the end of endDate at the store
      const timezone = (await getTenantSettingsById(tenantId))?.timezone;
      query.date = {};
      if (startDate) query.date.$gte = tenantDayEdge(startDate, 'start', timezone);
      if (endDate) query.date.$lte = tenantDayEdge(endDate, 'end', timezone);
    }

    if (name) {
      query.name = name;
    }

    const expenses = await Expense.find(query)
      .populate('userId', 'name email')
      .sort({ date: -1 })
      .limit(LIST_SAFETY_CAP + 1)
      .lean();

    return NextResponse.json({
      success: true,
      data: expenses.slice(0, LIST_SAFETY_CAP),
      truncated: expenses.length > LIST_SAFETY_CAP,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch expenses');
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId, user } = authResult;
    const userId = user.userId;
    const t = await getValidationTranslatorFromRequest(request);

    if (!(await hasTenantPermission(user.role, tenantId, 'expenses.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:expenses:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    const body = await request.json();
    const { name, description, amount, date, paymentMethod, receipt, notes } = body;

    // Validate required fields
    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: t('validation.expenseNameRequired', 'Name of expense is required') },
        { status: 400 }
      );
    }

    if (!description || !description.trim()) {
      return NextResponse.json(
        { success: false, error: t('validation.descriptionRequired', 'Description is required') },
        { status: 400 }
      );
    }

    if (amount === undefined || amount === null || amount === '') {
      return NextResponse.json(
        { success: false, error: t('validation.amountRequired', 'Amount is required') },
        { status: 400 }
      );
    }

    const amountValue = parseFloat(amount);
    if (isNaN(amountValue) || amountValue < 0) {
      return NextResponse.json(
        { success: false, error: t('validation.amountPositive', 'Amount must be a valid positive number') },
        { status: 400 }
      );
    }

    const timezone = (await getTenantSettingsById(tenantId))?.timezone;
    const expenseDate = date ? expenseDateFromInput(date, timezone) : new Date();
    if (!expenseDate) {
      return NextResponse.json({ success: false, error: t('validation.invalidDate', 'Invalid date') }, { status: 400 });
    }

    const expense = await Expense.create({
      tenantId,
      name: name.trim(),
      description: description.trim(),
      amount: Math.round(amountValue * 100) / 100,
      date: expenseDate,
      paymentMethod: paymentMethod || 'cash',
      receipt: receipt?.trim() || undefined,
      notes: notes?.trim() || undefined,
      userId,
    });

    await createAuditLog(request, {
      tenantId,
      userId,
      action: AuditActions.CREATE,
      entityType: 'expense',
      entityId: expense._id.toString(),
      changes: { name, description, amount },
    });

    return NextResponse.json({ success: true, data: expense }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Failed to create expense');
  }
}

