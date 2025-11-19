import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Expense from '@/models/Expense';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const expense = await Expense.findOne({ _id: id, tenantId })
      .populate('userId', 'name email')
      .lean();

    if (!expense) {
      return NextResponse.json({ success: false, error: 'Expense not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: expense });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const expense = await Expense.findOne({ _id: id, tenantId });
    if (!expense) {
      return NextResponse.json({ success: false, error: 'Expense not found' }, { status: 404 });
    }

    const body = await request.json();
    const { category, description, amount, date, paymentMethod, receipt, notes } = body;

    const oldData = expense.toObject();

    if (category) expense.category = category;
    if (description) expense.description = description;
    if (amount !== undefined) expense.amount = parseFloat(amount);
    if (date) expense.date = new Date(date);
    if (paymentMethod) expense.paymentMethod = paymentMethod;
    if (receipt !== undefined) expense.receipt = receipt;
    if (notes !== undefined) expense.notes = notes;

    await expense.save();

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'expense',
      entityId: expense._id.toString(),
      changes: { before: oldData, after: expense.toObject() },
    });

    return NextResponse.json({ success: true, data: expense });
  } catch (error: any) {
    console.error('Error updating expense:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const expense = await Expense.findOne({ _id: id, tenantId });
    if (!expense) {
      return NextResponse.json({ success: false, error: 'Expense not found' }, { status: 404 });
    }

    const oldData = expense.toObject();
    await expense.deleteOne();

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.DELETE,
      entityType: 'expense',
      entityId: expense._id.toString(),
      changes: { category: expense.category, description: expense.description, amount: expense.amount },
    });

    return NextResponse.json({ success: true, message: 'Expense deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting expense:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

