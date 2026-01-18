import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Expense from '@/models/Expense';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const name = searchParams.get('name');

    const query: Record<string, unknown> = { tenantId };
    
    if (startDate || endDate) {
      const dateFilter: { $gte?: Date; $lte?: Date } = {};
      if (startDate) dateFilter.$gte = new Date(startDate);
      if (endDate) dateFilter.$lte = new Date(endDate);
      query.date = dateFilter;
    }

    if (name) {
      query.name = name;
    }

    const expenses = await Expense.find(query)
      .populate('userId', 'name email')
      .sort({ date: -1 })
      .lean();

    return NextResponse.json({ success: true, data: expenses });
  } catch (error: unknown) {
    console.error('Error fetching expenses:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
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
      userId: user.userId,
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.CREATE,
      entityType: 'expense',
      entityId: expense._id.toString(),
      changes: { name, description, amount },
    });

    return NextResponse.json({ success: true, data: expense }, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating expense:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

