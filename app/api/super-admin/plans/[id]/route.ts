import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SubscriptionPlan from '@/models/SubscriptionPlan';
import Subscription from '@/models/Subscription';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';
import Tenant from '@/models/Tenant';
import mongoose from 'mongoose';

async function defaultTenantId(): Promise<mongoose.Types.ObjectId | undefined> {
  const t = await Tenant.findOne({ slug: 'default' }).select('_id').lean();
  return t?._id;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    await requireRole(request, ['super_admin']);

    const { id } = await params;
    const plan = await SubscriptionPlan.findById(id).lean();
    if (!plan) {
      return NextResponse.json({ success: false, error: 'Plan not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: plan });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    return handleApiError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const user = await requireRole(request, ['super_admin']);

    const { id } = await params;
    const body = await request.json();

    const existingPlan = await SubscriptionPlan.findById(id).lean();
    if (!existingPlan) {
      return NextResponse.json({ success: false, error: 'Plan not found' }, { status: 404 });
    }

    // Tier is meant to be immutable after creation (the create form locks the
    // field once editing) — enforce that server-side too, otherwise a direct
    // API call could retarget a plan's tier and collide with another plan's
    // tier, which POST's uniqueness check would have blocked at creation time.
    if (body.tier !== undefined && body.tier !== existingPlan.tier) {
      return NextResponse.json({ success: false, error: 'Plan tier cannot be changed after creation' }, { status: 400 });
    }

    const plan = await SubscriptionPlan.findByIdAndUpdate(
      id,
      { $set: body },
      { new: true, runValidators: true }
    );
    if (!plan) {
      return NextResponse.json({ success: false, error: 'Plan not found' }, { status: 404 });
    }

    const tenantId = await defaultTenantId();
    if (tenantId) {
      await createAuditLog(request, {
        tenantId,
        userId: user.userId,
        action: AuditActions.UPDATE,
        entityType: 'subscription_plan',
        entityId: plan._id.toString(),
        changes: body,
        metadata: { updatedBy: user.userId, role: 'super_admin' },
      });
    }

    return NextResponse.json({ success: true, data: plan });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const user = await requireRole(request, ['super_admin']);

    const { id } = await params;
    const plan = await SubscriptionPlan.findById(id);
    if (!plan) {
      return NextResponse.json({ success: false, error: 'Plan not found' }, { status: 404 });
    }

    // Check for active/trial subscriptions referencing this plan
    const activeCount = await Subscription.countDocuments({
      planId: id,
      status: { $in: ['active', 'trial'] },
    });

    const tenantId = await defaultTenantId();

    if (activeCount > 0) {
      // Soft-delete: mark inactive instead of hard delete
      plan.isActive = false;
      await plan.save();
      if (tenantId) {
        await createAuditLog(request, {
          tenantId,
          userId: user.userId,
          action: AuditActions.UPDATE,
          entityType: 'subscription_plan',
          entityId: plan._id.toString(),
          changes: { isActive: { from: true, to: false } },
          metadata: { reason: 'delete_blocked_soft_deactivated', activeSubscriptions: activeCount, updatedBy: user.userId, role: 'super_admin' },
        });
      }
      return NextResponse.json({
        success: true,
        data: plan,
        message: `Plan deactivated (${activeCount} active subscription(s) reference it). Hard delete blocked.`,
      });
    }

    if (tenantId) {
      await createAuditLog(request, {
        tenantId,
        userId: user.userId,
        action: AuditActions.DELETE,
        entityType: 'subscription_plan',
        entityId: plan._id.toString(),
        changes: { name: plan.name, tier: plan.tier },
        metadata: { deletedBy: user.userId, role: 'super_admin' },
      });
    }

    await plan.deleteOne();
    return NextResponse.json({ success: true, message: 'Plan deleted' });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    return handleApiError(error);
  }
}
