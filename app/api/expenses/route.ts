import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Expense from '@/models/Expense';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const category = searchParams.get('category');

    const query: any = { tenantId };
    
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    if (category) {
      query.category = category;
    }

    const expenses = await Expense.find(query)
      .populate('userId', 'name email')
      .sort({ date: -1 })
      .lean();

    return NextResponse.json({ success: true, data: expenses });
  } catch (error: any) {
    console.error('Error fetching expenses:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const body = await request.json();
    const { category, description, amount, date, paymentMethod, receipt, notes } = body;

    if (!category || !description || amount === undefined) {
      return NextResponse.json(
        { success: false, error: 'Category, description, and amount are required' },
        { status: 400 }
      );
    }

    const expense = await Expense.create({
      tenantId,
      category,
      description,
      amount: parseFloat(amount),
      date: date ? new Date(date) : new Date(),
      paymentMethod: paymentMethod || 'cash',
      receipt,
      notes,
      userId: user.userId,
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.CREATE,
      entityType: 'expense',
      entityId: expense._id.toString(),
      changes: { category, description, amount },
    });

    return NextResponse.json({ success: true, data: expense }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating expense:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

