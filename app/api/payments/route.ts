import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Payment from '@/models/Payment';
import Transaction from '@/models/Transaction';
import { getTenantIdFromRequest, requireTenantAccess } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const tenantId = await getTenantIdFromRequest(request);
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found or access denied' }, { status: 403 });
    }
    
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50');
    const page = parseInt(searchParams.get('page') || '1');
    const skip = (page - 1) * limit;
    const status = searchParams.get('status');
    const method = searchParams.get('method');
    const transactionId = searchParams.get('transactionId');

    const query: any = { tenantId };
    
    if (status) {
      query.status = status;
    }
    
    if (method) {
      query.method = method;
    }
    
    if (transactionId) {
      query.transactionId = transactionId;
    }

    const payments = await Payment.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .populate('transactionId', 'receiptNumber total')
      .populate('processedBy', 'name email')
      .lean();

    const total = await Payment.countDocuments(query);

    return NextResponse.json({
      success: true,
      data: payments || [],
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const tenantAccess = await requireTenantAccess(request);
    const { tenantId, user } = tenantAccess;
    
    const body = await request.json();
    const { transactionId, method, amount, details } = body;

    // Validate required fields
    if (!transactionId || !method || !amount) {
      return NextResponse.json(
        { success: false, error: 'Transaction ID, payment method, and amount are required' },
        { status: 400 }
      );
    }

    // Validate payment method
    const validMethods = ['cash', 'card', 'digital', 'check', 'other'];
    if (!validMethods.includes(method)) {
      return NextResponse.json(
        { success: false, error: 'Invalid payment method' },
        { status: 400 }
      );
    }

    // Verify transaction exists and belongs to tenant
    const transaction = await Transaction.findOne({
      _id: transactionId,
      tenantId,
    });

    if (!transaction) {
      return NextResponse.json(
        { success: false, error: 'Transaction not found' },
        { status: 404 }
      );
    }

    // Create payment record
    const payment = await Payment.create({
      tenantId,
      transactionId,
      method,
      amount,
      details,
      status: 'completed',
      processedBy: user.userId,
      processedAt: new Date(),
    });

    // Create audit log
    await createAuditLog(request, {
      tenantId,
      action: AuditActions.PAYMENT_CREATE,
      entityType: 'payment',
      entityId: payment._id.toString(),
      changes: {
        transactionId: transactionId.toString(),
        method,
        amount,
      },
    });

    return NextResponse.json({ success: true, data: payment }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
