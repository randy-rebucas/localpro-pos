import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth, getCurrentUser } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { validateAndSanitize, validatePayment } from '@/lib/validation';
import AccountsReceivable from '@/models/AccountsReceivable';
import PaymentRecord from '@/models/PaymentRecord';
import Customer from '@/models/Customer';

// POST /api/receivables/:id/payment - Record a payment against receivable
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { allowed } = checkRateLimit(`write:payments:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const { id: receivableId } = await params;
    const rawBody = await request.json();
    const { data: body, errors: validationErrors } = validateAndSanitize(rawBody, validatePayment, t);
    if (validationErrors.length > 0) {
      return NextResponse.json({ success: false, errors: validationErrors }, { status: 400 });
    }

    const { amount, paymentMethod = 'cash', reference, notes, transactionId } = body as {
      amount: number; paymentMethod?: string; reference?: string; notes?: string; transactionId?: string;
    };

    // Fetch receivable and validate
    const receivable = await AccountsReceivable.findOne({ _id: receivableId, tenantId, isActive: true });
    if (!receivable) {
      return NextResponse.json(
        { success: false, error: t('validation.receivableNotFound', 'Receivable not found') },
        { status: 404 }
      );
    }

    // Check payment amount doesn't exceed outstanding
    if (amount > receivable.outstandingAmount) {
      return NextResponse.json(
        { success: false, error: `Payment cannot exceed outstanding amount (₱${receivable.outstandingAmount.toFixed(2)})` },
        { status: 400 }
      );
    }

    // Start transaction session for atomic updates
    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      // Create payment record
      const paymentRecord = await PaymentRecord.create(
        [
          {
            tenantId,
            customerId: receivable.customerId,
            receivableId,
            transactionId: transactionId || undefined,
            amount,
            paymentMethod,
            reference,
            notes,
            processedBy: user.userId,
            processedAt: new Date(),
          },
        ],
        { session }
      );

      // Update receivable
      const newPaidAmount = receivable.paidAmount + amount;
      const newOutstandingAmount = receivable.originalAmount - newPaidAmount;
      let newStatus = receivable.paymentStatus;

      if (newOutstandingAmount === 0) {
        newStatus = 'paid';
      } else if (newPaidAmount > 0) {
        newStatus = 'partial';
      }

      // Mark as overdue if past due date and not fully paid
      if (newOutstandingAmount > 0 && new Date() > receivable.dueDate) {
        newStatus = 'overdue';
      }

      await AccountsReceivable.updateOne(
        { _id: receivableId },
        {
          $set: {
            paidAmount: newPaidAmount,
            outstandingAmount: newOutstandingAmount,
            paymentStatus: newStatus,
          },
        },
        { session }
      );

      // Update customer's total outstanding debt
      const totalDebt = await AccountsReceivable.aggregate([
        {
          $match: {
            tenantId,
            customerId: receivable.customerId,
            paymentStatus: { $in: ['pending', 'partial', 'overdue'] },
            isActive: true,
          },
        },
        { $group: { _id: null, total: { $sum: '$outstandingAmount' } } },
      ]).session(session);

      await Customer.updateOne(
        { _id: receivable.customerId },
        { $set: { totalOutstandingDebt: totalDebt[0]?.total || 0 } },
        { session }
      );

      await session.commitTransaction();

      // Log audit
      await createAuditLog(request, {
        tenantId,
        action: 'record_payment',
        entityType: 'PaymentRecord',
        entityId: paymentRecord[0]._id.toString(),
        metadata: {
          receivableId,
          customerId: receivable.customerId,
          amount,
          paymentMethod,
          newStatus,
        },
      });

      return NextResponse.json({
        success: true,
        data: {
          paymentRecord: paymentRecord[0],
          receivable: {
            _id: receivableId,
            paidAmount: newPaidAmount,
            outstandingAmount: newOutstandingAmount,
            paymentStatus: newStatus,
          },
        },
      });
    } catch (sessionError) {
      await session.abortTransaction();
      throw sessionError;
    } finally {
      session.endSession();
    }
  } catch (error) {
    return handleApiError(error, 'Failed to record payment');
  }
}
