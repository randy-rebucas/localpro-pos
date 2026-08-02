import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { subscriptionToApi } from '@/lib/data/subscriptions';

export async function GET(request: NextRequest) {
  try {
    // Cross-tenant subscription list — super_admin only
    await requireRole(request, ['super_admin']);

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const where: Record<string, unknown> = { isActive: true };

    if (status) {
      where.status = status;
    }

    const subscriptions = await prisma.subscription.findMany({
      where,
      include: { tenant: true, plan: true },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: subscriptions.map(subscriptionToApi) });
  } catch (error: unknown) {
    if ((error as Error).message === 'Unauthorized' || (error as Error).message.includes('Forbidden')) {
      return NextResponse.json(
        { success: false, error: (error as Error).message },
        { status: (error as Error).message === 'Unauthorized' ? 401 : 403 }
      );
    }
    return NextResponse.json({ success: false, error: 'Failed to fetch subscriptions' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Creating a subscription for an arbitrary tenantId — super_admin only
    await requireRole(request, ['super_admin']);

    const body = await request.json();
    const { tenantId, planId, billingCycle = 'monthly', isTrial = false } = body;

    if (!tenantId || !planId) {
      return NextResponse.json(
        { success: false, error: 'Tenant ID and Plan ID are required' },
        { status: 400 }
      );
    }

    // Verify tenant exists
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found' },
        { status: 404 }
      );
    }

    // Check if tenant already has an active subscription
    const existingSubscription = await prisma.subscription.findFirst({
      where: { tenantId, status: { in: ['active', 'trial'] } },
    });

    if (existingSubscription) {
      return NextResponse.json(
        { success: false, error: 'Tenant already has an active subscription' },
        { status: 400 }
      );
    }

    // Verify plan exists and is active
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) {
      return NextResponse.json(
        { success: false, error: 'Subscription plan not found or inactive' },
        { status: 404 }
      );
    }

    const now = new Date();
    const data: Record<string, unknown> = {
      tenantId,
      planId,
      status: isTrial ? 'trial' : 'active',
      billingCycle,
      startDate: now,
      isTrial,
      autoRenew: true,
      usage: {
        currentUsers: 1, // Admin user
        currentBranches: 1,
        currentProducts: 0,
        currentTransactions: 0,
        lastResetDate: now,
      },
    };

    // Set trial period (30 days) if applicable
    if (isTrial) {
      const trialEndDate = new Date(now);
      trialEndDate.setDate(trialEndDate.getDate() + 30);
      data.trialEndDate = trialEndDate;
      data.nextBillingDate = trialEndDate;
    } else {
      // Set next billing date for paid subscription
      const nextBilling = new Date(now);
      if (billingCycle === 'yearly') {
        nextBilling.setFullYear(nextBilling.getFullYear() + 1);
      } else {
        nextBilling.setMonth(nextBilling.getMonth() + 1);
      }
      data.nextBillingDate = nextBilling;
    }

    let subscription;
    try {
      subscription = await prisma.subscription.create({ data: data as any }); // eslint-disable-line @typescript-eslint/no-explicit-any
    } catch (createError: unknown) {
      if ((createError as Record<string, unknown>).code === 'P2002') {
        return NextResponse.json(
          { success: false, error: 'Tenant already has a subscription' },
          { status: 400 }
        );
      }
      throw createError;
    }

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.CREATE,
      entityType: 'subscription',
      entityId: subscription.id,
      changes: {
        planId: planId,
        status: subscription.status,
        billingCycle,
        isTrial,
      },
    });

    const populatedSubscription = await prisma.subscription.findUnique({
      where: { id: subscription.id },
      include: { tenant: true, plan: true },
    });

    return NextResponse.json({
      success: true,
      data: subscriptionToApi(populatedSubscription!),
    }, { status: 201 });
  } catch (error: unknown) {
    if ((error as Record<string, unknown>).code === 'P2002') {
      return NextResponse.json(
        { success: false, error: 'Tenant already has a subscription' },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 400 });
  }
}
