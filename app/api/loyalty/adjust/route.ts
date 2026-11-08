import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
import Customer from '@/models/Customer';
import LoyaltyTransaction from '@/models/LoyaltyTransaction';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
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

    const tenantId = await getTenantIdFromRequest(request);
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (!(await hasTenantPermission(user.role, tenantId, 'loyalty.adjust'))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
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
    if (typeof points !== 'number' || !Number.isInteger(points) || points === 0 || Math.abs(points) > 1_000_000) {
      return NextResponse.json({ success: false, error: 'points must be a non-zero whole number' }, { status: 400 });
    }
    if (!mongoose.isValidObjectId(customerId)) {
      return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 });
    }
    if (!description || typeof description !== 'string' || !description.trim()) {
      return NextResponse.json({ success: false, error: 'description is required' }, { status: 400 });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // One atomic update (never below 0) instead of read-then-save: a POS
      // earn landing between the read and the save used to be wiped out.
      // new:false hands back the balance this update started from.
      const before = await Customer.findOneAndUpdate(
        { _id: customerId, tenantId },
        [{ $set: { loyaltyPointsBalance: { $max: [0, { $add: [{ $ifNull: ['$loyaltyPointsBalance', 0] }, points] }] } } }],
        { new: false, session, projection: { loyaltyPointsBalance: 1 } }
      ).lean<{ _id: mongoose.Types.ObjectId; loyaltyPointsBalance?: number }>();
      if (!before) {
        await session.abortTransaction();
        return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 });
      }

      const balanceBefore = before.loyaltyPointsBalance ?? 0;
      const balanceAfter = Math.max(0, balanceBefore + points);
      // What actually moved: deducting 500 from 100 takes 100, and the ledger
      // must say so for the history to add up to the balance.
      const applied = balanceAfter - balanceBefore;
      if (applied === 0) {
        await session.abortTransaction();
        return NextResponse.json({ success: false, error: 'This customer has no points to deduct' }, { status: 400 });
      }
      const customer = before;

      const loyaltyTx = await LoyaltyTransaction.create([{
        tenantId,
        customerId: customer._id,
        type: 'adjust',
        points: applied,
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
        changes: { customerId, requested: points, points: applied, balanceBefore, balanceAfter, description },
      });

      return NextResponse.json({
        success: true,
        data: {
          customerId,
          balanceBefore,
          balanceAfter,
          pointsAdjusted: applied,
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
