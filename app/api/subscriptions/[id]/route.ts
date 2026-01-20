import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Subscription from '@/models/Subscription';
import Tenant from '@/models/Tenant';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB();

    const subscription = await Subscription.findById(params.id)
      .populate('tenantId', 'slug name settings')
      .populate('planId', 'name tier price features')
      .lean();

    if (!subscription) {
      return NextResponse.json(
        { success: false, error: 'Subscription not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: subscription });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB();
    await requireRole(request, ['admin']);

    const body = await request.json();
    const { status, billingCycle, autoRenew, planId } = body;

    const subscription = await Subscription.findById(params.id);
    if (!subscription) {
      return NextResponse.json(
        { success: false, error: 'Subscription not found' },
        { status: 404 }
      );
    }

    const changes: any = {};

    // Update status if provided
    if (status && ['active', 'inactive', 'cancelled', 'suspended', 'trial'].includes(status)) {
      changes.status = status;
      if (status === 'cancelled') {
        changes.cancelledAt = new Date();
        changes.autoRenew = false;
      } else if (status === 'suspended') {
        changes.suspendedAt = new Date();
      }
    }

    // Update billing cycle if provided
    if (billingCycle && ['monthly', 'yearly'].includes(billingCycle)) {
      changes.billingCycle = billingCycle;
    }

    // Update auto-renew if provided
    if (typeof autoRenew === 'boolean') {
      changes.autoRenew = autoRenew;
    }

    // Update plan if provided
    if (planId) {
      // Verify plan exists
      const SubscriptionPlan = (await import('@/models/SubscriptionPlan')).default;
      const plan = await SubscriptionPlan.findById(planId);
      if (!plan || !plan.isActive) {
        return NextResponse.json(
          { success: false, error: 'Subscription plan not found or inactive' },
          { status: 404 }
        );
      }
      changes.planId = planId;
    }

    const updatedSubscription = await Subscription.findByIdAndUpdate(
      params.id,
      changes,
      { new: true }
    ).populate('tenantId', 'slug name')
     .populate('planId', 'name tier price features');

    await createAuditLog(request, {
      tenantId: subscription.tenantId,
      action: AuditActions.UPDATE,
      entityType: 'subscription',
      entityId: subscription._id.toString(),
      changes,
    });

    return NextResponse.json({ success: true, data: updatedSubscription });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB();
    await requireRole(request, ['admin']);

    const subscription = await Subscription.findById(params.id);
    if (!subscription) {
      return NextResponse.json(
        { success: false, error: 'Subscription not found' },
        { status: 404 }
      );
    }

    // Remove subscription reference from tenant
    await Tenant.findByIdAndUpdate(subscription.tenantId, {
      $unset: { subscriptionId: 1 }
    });

    await Subscription.findByIdAndDelete(params.id);

    await createAuditLog(request, {
      tenantId: subscription.tenantId,
      action: AuditActions.DELETE,
      entityType: 'subscription',
      entityId: subscription._id.toString(),
      changes: { deleted: true },
    });

    return NextResponse.json({ success: true, message: 'Subscription deleted successfully' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}