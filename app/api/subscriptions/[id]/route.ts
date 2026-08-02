import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getSubscriptionById, subscriptionToApi } from '@/lib/data/subscriptions';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Cross-tenant subscription lookup by id — super_admin only
    await requireRole(request, ['super_admin']);
    const { id } = await params;

    const subscription = await getSubscriptionById(id);

    if (!subscription) {
      return NextResponse.json(
        { success: false, error: 'Subscription not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: subscriptionToApi(subscription) });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Cross-tenant subscription mutation by id — super_admin only
    await requireRole(request, ['super_admin']);
    const { id } = await params;

    const body = await request.json();
    const { status, billingCycle, autoRenew, planId } = body;

    const subscription = await prisma.subscription.findUnique({ where: { id } });
    if (!subscription) {
      return NextResponse.json(
        { success: false, error: 'Subscription not found' },
        { status: 404 }
      );
    }

    const changes: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any

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

    // Update billing cycle if provided — also recalculate nextBillingDate
    if (billingCycle && ['monthly', 'yearly'].includes(billingCycle)) {
      changes.billingCycle = billingCycle;
      const next = new Date();
      if (billingCycle === 'yearly') {
        next.setFullYear(next.getFullYear() + 1);
      } else {
        next.setMonth(next.getMonth() + 1);
      }
      changes.nextBillingDate = next;
    }

    // Update auto-renew if provided
    if (typeof autoRenew === 'boolean') {
      changes.autoRenew = autoRenew;
    }

    // Update plan if provided
    if (planId) {
      // Verify plan exists
      const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
      if (!plan || !plan.isActive) {
        return NextResponse.json(
          { success: false, error: 'Subscription plan not found or inactive' },
          { status: 404 }
        );
      }
      changes.planId = planId;
    }

    await prisma.subscription.update({ where: { id }, data: changes });
    const updatedSubscription = await prisma.subscription.findUnique({
      where: { id },
      include: { tenant: true, plan: true },
    });

    await createAuditLog(request, {
      tenantId: subscription.tenantId,
      action: AuditActions.UPDATE,
      entityType: 'subscription',
      entityId: subscription.id,
      changes,
    });

    return NextResponse.json({ success: true, data: subscriptionToApi(updatedSubscription!) });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Cross-tenant subscription cancellation by id — super_admin only
    await requireRole(request, ['super_admin']);
    const { id } = await params;

    const existing = await prisma.subscription.findUnique({ where: { id } });
    if (!existing || !existing.isActive) {
      return NextResponse.json(
        { success: false, error: 'Subscription not found' },
        { status: 404 }
      );
    }

    const subscription = await prisma.subscription.update({
      where: { id },
      data: { isActive: false, status: 'cancelled', cancelledAt: new Date() },
    });

    await createAuditLog(request, {
      tenantId: subscription.tenantId,
      action: AuditActions.DELETE,
      entityType: 'subscription',
      entityId: subscription.id,
      changes: { softDeleted: true },
    });

    return NextResponse.json({ success: true, message: 'Subscription deleted successfully' });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
