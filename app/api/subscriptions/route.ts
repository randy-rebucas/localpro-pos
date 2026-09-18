import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

export async function GET(request: NextRequest) {
  try {
    // Cross-tenant subscription list — super_admin only
    await requireRole(request, ['super_admin']);

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};
    if (status) {
      where.status = status;
    }

    const subscriptions = await prisma.subscription.findMany({
      where,
      include: {
        tenant: { select: { id: true, slug: true, name: true } },
        plan: true,
      },
      orderBy: { startDate: 'desc' },
    });

    return NextResponse.json({ success: true, data: subscriptions });
  } catch (error: unknown) {
    if ((error as Error).message === 'Unauthorized' || (error as Error).message.includes('Forbidden')) {
      return NextResponse.json(
        { success: false, error: (error as Error).message },
        { status: (error as Error).message === 'Unauthorized' ? 401 : 403 }
      );
    }
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json({ success: false, error: t('validation.failedToFetchSubscriptions', 'Failed to fetch subscriptions') }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const t = await getValidationTranslatorFromRequest(request);

    // Creating a subscription for an arbitrary tenantId — super_admin only
    await requireRole(request, ['super_admin']);

    const body = await request.json();
    const { tenantId, planId, billingCycle = 'monthly', isTrial = false } = body;

    if (!tenantId || !planId) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantAndPlanIdRequired', 'Tenant ID and Plan ID are required') },
        { status: 400 }
      );
    }

    // Verify tenant exists
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
    }

    // Check if tenant already has an active subscription (Subscription.tenantId is unique)
    const existingSubscription = await prisma.subscription.findUnique({
      where: { tenantId },
    });

    if (existingSubscription && ['active', 'trial'].includes(existingSubscription.status)) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantAlreadyHasActiveSubscription', 'Tenant already has an active subscription') },
        { status: 400 }
      );
    }

    // Verify plan exists and is active
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) {
      return NextResponse.json(
        { success: false, error: t('validation.subscriptionPlanNotFoundOrInactive', 'Subscription plan not found or inactive') },
        { status: 404 }
      );
    }

    const now = new Date();

    let trialEndDate: Date | undefined;
    let nextBillingDate: Date;

    if (isTrial) {
      trialEndDate = new Date(now);
      trialEndDate.setDate(trialEndDate.getDate() + 30);
      nextBillingDate = trialEndDate;
    } else {
      nextBillingDate = new Date(now);
      if (billingCycle === 'yearly') {
        nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
      } else {
        nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
      }
    }

    // Subscription create is scoped to a single tenant row via the unique
    // tenantId constraint, so there is no separate tenant backref write needed
    // (Tenant.subscription is the inverse side of Subscription.tenantId).
    const subscription = await prisma.subscription.create({
      data: {
        id: randomUUID(),
        tenantId,
        planId,
        status: isTrial ? 'trial' : 'active',
        billingCycle,
        startDate: now,
        isTrial,
        autoRenew: true,
        trialEndDate,
        nextBillingDate,
        usageCurrentUsers: 1,
        usageCurrentBranches: 1,
        usageCurrentProducts: 0,
        usageCurrentTransactions: 0,
        usageLastResetDate: now,
      },
      include: {
        tenant: { select: { id: true, slug: true, name: true } },
        plan: true,
      },
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.CREATE,
      entityType: 'subscription',
      entityId: subscription.id,
      changes: {
        planId,
        status: subscription.status,
        billingCycle,
        isTrial,
      },
    });

    return NextResponse.json({
      success: true,
      data: subscription,
    }, { status: 201 });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2002') {
      const t = await getValidationTranslatorFromRequest(request);
      return NextResponse.json(
        { success: false, error: t('validation.tenantAlreadyHasSubscription', 'Tenant already has a subscription') },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 400 });
  }
}
