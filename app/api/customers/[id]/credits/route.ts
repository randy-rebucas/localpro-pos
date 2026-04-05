import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { requireAuth, getCurrentUser } from '@/lib/auth';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import connectDB from '@/lib/mongodb';
import { handleApiError } from '@/lib/error-handler';
import { createAuditLog } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';
import { validateAndSanitize, validateCredit } from '@/lib/validation';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import Customer from '@/models/Customer';
import Credit from '@/models/Credit';

// GET /api/customers/[id]/credits - Get customer credit balance and history
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: customerId } = await params;
    await requireAuth(request);
    const user = await getCurrentUser(request);
    const tenantId = await getTenantIdFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const skip = parseInt(searchParams.get('skip') || '0');

    await connectDB();

    // Get customer and verify ownership
    const customer = await Customer.findOne({ _id: customerId, tenantId, isActive: true });
    if (!customer) {
      return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 });
    }

    // Get most recent credit transaction to determine current balance
    const mostRecentCredit = await Credit.findOne({
      tenantId,
      customerId,
    })
      .sort({ createdAt: -1 })
      .select('balanceAfter')
      .lean();

    const creditBalance = mostRecentCredit?.balanceAfter || 0;

    // Get credit history
    const history = await Credit.find({
      tenantId,
      customerId,
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .select('type amount balanceBefore balanceAfter reason transactionId createdBy createdAt')
      .lean();

    const total = await Credit.countDocuments({
      tenantId,
      customerId,
    });

    return NextResponse.json({
      success: true,
      data: {
        creditBalance: creditBalance,
        creditHistory: history,
        pagination: { skip, limit, total },
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch credit balance');
  }
}

// POST /api/customers/[id]/credits - Add credits to customer
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: customerId } = await params;
    await requireAuth(request);
    const user = await getCurrentUser(request);
    const tenantId = await getTenantIdFromRequest(request);

    if (!tenantId || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Only admins/managers can add credits
    if (!['admin', 'manager', 'owner'].includes(user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    // Rate limit: 100 credit operations per hour per user
    const rateLimitKey = `credit:${tenantId}:${user.userId}`;
    const { allowed } = checkRateLimit(rateLimitKey, 100, 60 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many credit operations. Please try again later.' },
        { status: 429 }
      );
    }

    const t = await getValidationTranslatorFromRequest(request);
    const rawBody = await request.json();
    const { data: body, errors: validationErrors } = validateAndSanitize(rawBody, validateCredit, t);
    if (validationErrors.length > 0) {
      return NextResponse.json({ success: false, errors: validationErrors }, { status: 400 });
    }

    const { amount, reason, type = 'top_up' } = body as {
      amount: number; reason?: string; type: 'top_up' | 'adjustment' | 'refund';
    };

    await connectDB();

    // Start session for atomic operations
    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      // Get customer and verify ownership - tenant validated here
      const customer = await Customer.findOne(
        { _id: customerId, tenantId, isActive: true },
        'firstName lastName',
        { session }
      );
      if (!customer) {
        await session.abortTransaction();
        return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 });
      }

      // Get current credit balance from most recent credit transaction
      const mostRecentCredit = await Credit.findOne(
        { tenantId, customerId },
        'balanceAfter',
        { session }
      )
        .sort({ createdAt: -1 });

      const currentBalance = mostRecentCredit?.balanceAfter || 0;
      const newBalance = currentBalance + amount;
      if (newBalance < 0) {
        await session.abortTransaction();
        return NextResponse.json(
          { success: false, error: 'Insufficient credits for refund' },
          { status: 400 }
        );
      }

      // Create credit transaction record with balanceBefore and balanceAfter
      const creditTransactions = await Credit.create(
        [
          {
            tenantId,
            customerId,
            type,
            amount,
            balanceBefore: currentBalance,
            balanceAfter: newBalance,
            reason,
            createdBy: user.userId,
          },
        ],
        { session }
      );
      const creditTransaction = creditTransactions[0];

      // Create audit log
      await createAuditLog(request, {
        tenantId,
        action: `${type}_credit`,
        entityType: 'Credit',
        entityId: creditTransaction._id.toString(),
        metadata: {
          customerId,
          customerName: `${customer.firstName} ${customer.lastName}`,
          amount,
          balanceBefore: currentBalance,
          balanceAfter: newBalance,
          reason,
        },
      });

      await session.commitTransaction();

      return NextResponse.json({
        success: true,
        data: {
          customerId,
          newBalance: newBalance,
          transaction: creditTransaction,
        },
      });
    } catch (sessionError) {
      await session.abortTransaction();
      throw sessionError;
    } finally {
      session.endSession();
    }
  } catch (error) {
    return handleApiError(error, 'Failed to add credits');
  }
}
