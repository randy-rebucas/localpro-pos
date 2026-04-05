import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth, getCurrentUser } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { validateAndSanitize, validateReceivable } from '@/lib/validation';
import AccountsReceivable from '@/models/AccountsReceivable';
import PaymentRecord from '@/models/PaymentRecord';
import Customer from '@/models/Customer';
import Transaction from '@/models/Transaction';

// GET /api/receivables - List all accounts receivable (admin only)
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const user = await getCurrentUser(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 403 });
    }

    const ip = getClientIp(request);
    const { allowed } = checkRateLimit(`read:receivables:${tenantId}:${ip}`, 100, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    // Optional: Restrict to admins/managers only
    if (!['admin', 'manager', 'owner'].includes(user?.role || '')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '50')), 200);
    const skip = (page - 1) * limit;
    const status = searchParams.get('status'); // 'pending', 'partial', 'paid', 'overdue', 'cancelled'
    const customerId = searchParams.get('customerId');
    const minDays = parseInt(searchParams.get('minDays') || '0'); // For aging (days overdue)

    const query: Record<string, unknown> = { tenantId, isActive: true };

    if (status && ['pending', 'partial', 'paid', 'overdue', 'cancelled'].includes(status)) {
      query.paymentStatus = status;
    }
    if (customerId) {
      query.customerId = customerId;
    }
    if (minDays > 0) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - minDays);
      query.dueDate = { $lte: cutoffDate };
    }

    const receivables = await AccountsReceivable.find(query)
      .sort({ dueDate: 1 })
      .limit(limit)
      .skip(skip)
      .populate('customerId', 'firstName lastName email phone')
      .populate('transactionId', 'receiptNumber')
      .lean();

    const total = await AccountsReceivable.countDocuments(query);

    // Calculate totals for dashboard
    const summaryQuery: Record<string, unknown> = { tenantId, isActive: true };
    const totalReceivables = await AccountsReceivable.aggregate([
      { $match: summaryQuery },
      {
        $group: {
          _id: null,
          totalOutstanding: { $sum: '$outstandingAmount' },
          totalPaid: { $sum: '$paidAmount' },
          totalInvoiced: { $sum: '$originalAmount' },
        },
      },
    ]);

    return NextResponse.json({
      success: true,
      data: receivables,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      summary: totalReceivables[0] || { totalOutstanding: 0, totalPaid: 0, totalInvoiced: 0 },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch receivables');
  }
}

// POST /api/receivables - Create accounts receivable (internal use after transaction)
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const user = await getCurrentUser(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const ip = getClientIp(request);
    const { allowed } = checkRateLimit(`write:receivables:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const rawBody = await request.json();
    const { data: body, errors: validationErrors } = validateAndSanitize(rawBody, validateReceivable, t);
    if (validationErrors.length > 0) {
      return NextResponse.json({ success: false, errors: validationErrors }, { status: 400 });
    }

    const { customerId, transactionId, originalAmount, dueDate, notes, invoiceNumber } = body as {
      customerId: string; transactionId: string; originalAmount: number; dueDate: string;
      notes?: string; invoiceNumber?: string;
    };

    // Validate customer exists and belongs to tenant
    const customer = await Customer.findOne({ _id: customerId, tenantId, isActive: true });
    if (!customer) {
      return NextResponse.json(
        { success: false, error: t('validation.customerNotFound', 'Customer not found') },
        { status: 404 }
      );
    }

    // Validate transaction exists and belongs to tenant
    const transaction = await Transaction.findOne({ _id: transactionId, tenantId, isActive: true });
    if (!transaction) {
      return NextResponse.json(
        { success: false, error: t('validation.transactionNotFound', 'Transaction not found') },
        { status: 404 }
      );
    }

    // Check if receivable already exists for this transaction
    const existing = await AccountsReceivable.findOne({ transactionId, tenantId });
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Receivable already exists for this transaction' },
        { status: 400 }
      );
    }

    const dueDateObj = new Date(dueDate);
    if (dueDateObj <= new Date()) {
      return NextResponse.json(
        { success: false, error: t('validation.dueDateMustBeFuture', 'Due date must be in the future') },
        { status: 400 }
      );
    }

    // Create receivable
    const receivable = await AccountsReceivable.create({
      tenantId,
      customerId,
      transactionId,
      originalAmount,
      paidAmount: 0,
      outstandingAmount: originalAmount,
      dueDate: dueDateObj,
      paymentStatus: 'pending',
      notes,
      invoiceNumber,
      createdBy: user.userId,
    });

    // Update customer's outstanding debt
    const totalDebt = await AccountsReceivable.aggregate([
      { $match: { tenantId, customerId, paymentStatus: { $in: ['pending', 'partial', 'overdue'] }, isActive: true } },
      { $group: { _id: null, total: { $sum: '$outstandingAmount' } } },
    ]);

    await Customer.updateOne(
      { _id: customerId },
      { $set: { totalOutstandingDebt: totalDebt[0]?.total || 0 } }
    );

    await createAuditLog(request, {
      tenantId,
      action: 'create_receivable',
      entityType: 'AccountsReceivable',
      entityId: receivable._id.toString(),
      metadata: {
        customerId,
        transactionId,
        amount: originalAmount,
        dueDate: dueDate,
      },
    });

    return NextResponse.json({ success: true, data: receivable }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Failed to create receivable');
  }
}
