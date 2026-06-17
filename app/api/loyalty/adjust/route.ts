import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
import Customer from '@/models/Customer';
import LoyaltyTransaction from '@/models/LoyaltyTransaction';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { getCurrentUser } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkFeatureAccess } from '@/lib/subscription';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!['owner', 'admin', 'manager'].includes(user.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const tenantId = await getTenantIdFromRequest(request);
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    try {
      await checkFeatureAccess(tenantId.toString(), 'enableLoyaltyProgram');
    } catch (featureError: unknown) {
      return NextResponse.json(
        { success: false, error: (featureError as Error).message },
        { status: 403 }
      );
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:loyalty-adjust:${tenantId}:${ip}`, 10, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const body = await request.json();
    const { customerId, points, description } = body;

    if (!customerId) {
      return NextResponse.json({ success: false, error: 'customerId is required' }, { status: 400 });
    }
    if (typeof points !== 'number' || points === 0) {
      return NextResponse.json({ success: false, error: 'points must be a non-zero number' }, { status: 400 });
    }
    if (!description || typeof description !== 'string' || !description.trim()) {
      return NextResponse.json({ success: false, error: 'description is required' }, { status: 400 });
    }

    const customer = await Customer.findOne({ _id: customerId, tenantId });
    if (!customer) {
      return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 });
    }

    const balanceBefore = customer.loyaltyPointsBalance ?? 0;
    const balanceAfter = Math.max(0, balanceBefore + points);

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      customer.loyaltyPointsBalance = balanceAfter;
      await customer.save({ session });

      const loyaltyTx = await LoyaltyTransaction.create([{
        tenantId,
        customerId: customer._id,
        type: 'adjust',
        points,
        balanceBefore,
        balanceAfter,
        description: description.trim(),
        createdBy: user.userId,
      }], { session });

      await session.commitTransaction();

      await createAuditLog(request, {
        tenantId: tenantId.toString(),
        userId: user.userId,
        action: AuditActions.UPDATE,
        entityType: 'loyalty_adjust',
        entityId: loyaltyTx[0]._id.toString(),
        changes: { customerId, points, balanceBefore, balanceAfter, description },
      });

      return NextResponse.json({
        success: true,
        data: {
          customerId,
          balanceBefore,
          balanceAfter,
          pointsAdjusted: points,
          loyaltyTransactionId: loyaltyTx[0]._id,
        },
      });
    } catch (txError) {
      await session.abortTransaction();
      throw txError;
    } finally {
      session.endSession();
    }
  } catch (error) {
    return handleApiError(error, 'Failed to adjust loyalty points');
  }
}
