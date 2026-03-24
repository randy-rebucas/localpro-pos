import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Expense from '@/models/Expense';
import { requireTenantAccess } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';

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
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    if (name) {
      query.name = name;
    }

    const expenses = await Expense.find(query)
      .populate('userId', 'name email')
      .sort({ date: -1 })
      .lean();

    return NextResponse.json({ success: true, data: expenses });
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

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:expenses:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
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

    const expense = await Expense.create({
      tenantId,
      name: name.trim(),
      description: description.trim(),
      amount: amountValue,
      date: date ? new Date(date) : new Date(),
      paymentMethod: paymentMethod || 'cash',
      receipt: receipt?.trim() || undefined,
      notes: notes?.trim() || undefined,
      userId,
    });

    await createAuditLog(request, {
      tenantId,
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

