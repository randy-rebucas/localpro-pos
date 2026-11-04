import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';
import { getRepos } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['super_admin']);

    const { subscriptionPlans, subscriptions } = getRepos();
    const plans = await subscriptionPlans.list();

    // Attach active subscriber count to each plan
    const countMap = await subscriptions.countActiveByPlanAcrossTenants();
    const plansWithCounts = plans.map(p => ({ ...p, subscriberCount: countMap[p._id] || 0 }));

    return NextResponse.json({ success: true, data: plansWithCounts });
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

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole(request, ['super_admin']);

    const body = await request.json();
    const { name, tier, description, price, features, birCompliance, isActive, isCustom, availableToNewTenants, yearlyDiscount } = body;

    if (!name || !tier || price?.monthly === undefined) {
      return NextResponse.json(
        { success: false, error: 'name, tier, and price.monthly are required' },
        { status: 400 }
      );
    }

    const { subscriptionPlans } = getRepos();
    const existing = await subscriptionPlans.findByTier(tier);
    if (existing) {
      return NextResponse.json(
        { success: false, error: `A plan with tier '${tier}' already exists` },
        { status: 409 }
      );
    }

    const plan = await subscriptionPlans.create({
      name,
      tier,
      description,
      price,
      features,
      birCompliance,
      isActive: isActive !== undefined ? isActive : true,
      isCustom: isCustom || false,
      availableToNewTenants: availableToNewTenants !== undefined ? availableToNewTenants : true,
      yearlyDiscount: yearlyDiscount || 0,
    });

    const defaultTenant = await getRepos().tenants.findBySlug('default', { select: '_id' });
    if (defaultTenant) {
      await createAuditLog(request, {
        tenantId: defaultTenant._id,
        userId: user.userId,
        action: AuditActions.CREATE,
        entityType: 'subscription_plan',
        entityId: plan._id,

        changes: { name, tier, price },
        metadata: { createdBy: user.userId, role: 'super_admin' },
      });
    }

    return NextResponse.json({ success: true, data: plan }, { status: 201 });
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
