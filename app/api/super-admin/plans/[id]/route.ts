import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';
import { getRepos, type SubscriptionPlanPatch } from '@/lib/db';

async function defaultTenantId(): Promise<string | undefined> {
  const t = await getRepos().tenants.findBySlug('default', { select: '_id' });
  return t?._id;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(request, ['super_admin']);

    const { id } = await params;
    const plan = await getRepos().subscriptionPlans.findById(id);
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
    const user = await requireRole(request, ['super_admin']);

    const { id } = await params;
    const body = await request.json();

    const { subscriptionPlans } = getRepos();
    const existingPlan = await subscriptionPlans.findById(id);
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

    const plan = await subscriptionPlans.update(id, body as SubscriptionPlanPatch);
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
        entityId: plan._id,
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
    const user = await requireRole(request, ['super_admin']);

    const { id } = await params;
    const { subscriptionPlans, subscriptions } = getRepos();
    const plan = await subscriptionPlans.findById(id);
    if (!plan) {
      return NextResponse.json({ success: false, error: 'Plan not found' }, { status: 404 });
    }

    // Check for active/trial subscriptions referencing this plan
    const activeCount = await subscriptions.countActiveOnPlanAcrossTenants(id);

    const tenantId = await defaultTenantId();

    if (activeCount > 0) {
      // Soft-delete: mark inactive instead of hard delete
      const deactivated = await subscriptionPlans.update(id, { isActive: false });
      if (tenantId) {
        await createAuditLog(request, {
          tenantId,
          userId: user.userId,
          action: AuditActions.UPDATE,
          entityType: 'subscription_plan',
          entityId: plan._id,
          changes: { isActive: { from: true, to: false } },
          metadata: { reason: 'delete_blocked_soft_deactivated', activeSubscriptions: activeCount, updatedBy: user.userId, role: 'super_admin' },
        });
      }
      return NextResponse.json({
        success: true,
        data: deactivated,
        message: `Plan deactivated (${activeCount} active subscription(s) reference it). Hard delete blocked.`,
      });
    }

    if (tenantId) {
      await createAuditLog(request, {
        tenantId,
        userId: user.userId,
        action: AuditActions.DELETE,
        entityType: 'subscription_plan',
        entityId: plan._id,
        changes: { name: plan.name, tier: plan.tier },
        metadata: { deletedBy: user.userId, role: 'super_admin' },
      });
    }

    await subscriptionPlans.delete(id);

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
