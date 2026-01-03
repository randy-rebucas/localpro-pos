import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Payment from '@/models/Payment';
import { requireTenantAccess } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const tenantAccess = await requireTenantAccess(request);
    const { tenantId, user } = tenantAccess;
    const { id: paymentId } = await params;
    
    const { refundReason } = await request.json();

    // Find payment
    const payment = await Payment.findOne({
      _id: paymentId,
      tenantId,
    });

    if (!payment) {
      return NextResponse.json(
        { success: false, error: 'Payment not found' },
        { status: 404 }
      );
    }

    // Check if already refunded
    if (payment.status === 'refunded') {
      return NextResponse.json(
        { success: false, error: 'Payment already refunded' },
        { status: 400 }
      );
    }

    // Update payment status
    payment.status = 'refunded';
    payment.refundedAt = new Date();
    if (refundReason) {
      payment.refundReason = refundReason;
    }
    await payment.save();

    // Create audit log
    await createAuditLog(request, {
      tenantId,
      action: AuditActions.PAYMENT_REFUND,
      entityType: 'payment',
      entityId: payment._id.toString(),
      changes: {
        status: 'refunded',
        refundReason,
      },
    });

    return NextResponse.json({ success: true, data: payment });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
