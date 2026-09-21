import { NextRequest, NextResponse } from 'next/server';
import prisma, { dbTransaction } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';
import type { Prisma } from '@prisma/client';

async function defaultTenantId(): Promise<string | undefined> {
  const t = await prisma.tenant.findUnique({ where: { slug: 'default' }, select: { id: true } });
  return t?.id;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(request, ['super_admin']);

    const { id } = await params;
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id } });
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

    const existingPlan = await prisma.subscriptionPlan.findUnique({ where: { id } });
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

    const { name, description, price, features, birCompliance, isActive, isCustom, availableToNewTenants, yearlyDiscount } = body;

    const changes: Prisma.SubscriptionPlanUpdateInput = {};

    if (name !== undefined) changes.name = name;
    if (description !== undefined) changes.description = description;

    if (price !== undefined) {
      changes.priceMonthly = price.monthly ?? existingPlan.priceMonthly;
      changes.priceSetupFee = price.setupFee ?? existingPlan.priceSetupFee ?? 0;
      changes.priceCurrency = price.currency ?? existingPlan.priceCurrency;
    }

    if (features !== undefined) {
      changes.maxUsers = features.maxUsers ?? existingPlan.maxUsers;
      changes.maxBranches = features.maxBranches ?? existingPlan.maxBranches;
      changes.maxProducts = features.maxProducts ?? existingPlan.maxProducts;
      changes.maxTransactions = features.maxTransactions ?? existingPlan.maxTransactions;
      changes.enableInventory = features.enableInventory ?? existingPlan.enableInventory;
      changes.enableCategories = features.enableCategories ?? existingPlan.enableCategories;
      changes.enableDiscounts = features.enableDiscounts ?? existingPlan.enableDiscounts;
      changes.enableLoyaltyProgram = features.enableLoyaltyProgram ?? existingPlan.enableLoyaltyProgram;
      changes.enableCustomerManagement = features.enableCustomerManagement ?? existingPlan.enableCustomerManagement;
      changes.enableBookingScheduling = features.enableBookingScheduling ?? existingPlan.enableBookingScheduling;
      changes.enableTableManagement = features.enableTableManagement ?? existingPlan.enableTableManagement;
      changes.enableReports = features.enableReports ?? existingPlan.enableReports;
      changes.enableMultiBranch = features.enableMultiBranch ?? existingPlan.enableMultiBranch;
      changes.enableHardwareIntegration = features.enableHardwareIntegration ?? existingPlan.enableHardwareIntegration;
      changes.prioritySupport = features.prioritySupport ?? existingPlan.prioritySupport;
      changes.customIntegrations = features.customIntegrations ?? existingPlan.customIntegrations;
      changes.dedicatedAccountManager = features.dedicatedAccountManager ?? existingPlan.dedicatedAccountManager;
    }

    if (birCompliance !== undefined) {
      changes.birPtuAssistance = birCompliance.ptuAssistance ?? existingPlan.birPtuAssistance ?? false;
      changes.birReceiptFormatting = birCompliance.receiptFormatting ?? existingPlan.birReceiptFormatting ?? false;
      changes.birDocumentation = birCompliance.birDocumentation ?? existingPlan.birDocumentation ?? false;
      changes.birCasReporting = birCompliance.casReporting ?? existingPlan.birCasReporting ?? false;
      changes.birAuditTrailSystem = birCompliance.auditTrailSystem ?? existingPlan.birAuditTrailSystem ?? false;
      changes.birMonthlySupport = birCompliance.monthlySupport ?? existingPlan.birMonthlySupport ?? false;
    }

    if (isActive !== undefined) changes.isActive = isActive;
    if (isCustom !== undefined) changes.isCustom = isCustom;
    if (availableToNewTenants !== undefined) changes.availableToNewTenants = availableToNewTenants;
    if (yearlyDiscount !== undefined) changes.yearlyDiscount = yearlyDiscount;

    const plan = await prisma.subscriptionPlan.update({
      where: { id },
      data: changes,
    });

    const tenantId = await defaultTenantId();
    if (tenantId) {
      await createAuditLog(request, {
        tenantId,
        userId: user.userId,
        action: AuditActions.UPDATE,
        entityType: 'subscription_plan',
        entityId: plan.id,
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
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!plan) {
      return NextResponse.json({ success: false, error: 'Plan not found' }, { status: 404 });
    }

    // Check for active/trial subscriptions referencing this plan
    const activeCount = await prisma.subscription.count({
      where: {
        planId: id,
        status: { in: ['active', 'trial'] },
      },
    });

    const tenantId = await defaultTenantId();

    if (activeCount > 0) {
      // Soft-delete: mark inactive instead of hard delete
      const updatedPlan = await prisma.subscriptionPlan.update({
        where: { id },
        data: { isActive: false },
      });
      if (tenantId) {
        await createAuditLog(request, {
          tenantId,
          userId: user.userId,
          action: AuditActions.UPDATE,
          entityType: 'subscription_plan',
          entityId: plan.id,
          changes: { isActive: { from: true, to: false } },
          metadata: { reason: 'delete_blocked_soft_deactivated', activeSubscriptions: activeCount, updatedBy: user.userId, role: 'super_admin' },
        });
      }
      return NextResponse.json({
        success: true,
        data: updatedPlan,
        message: `Plan deactivated (${activeCount} active subscription(s) reference it). Hard delete blocked.`,
      });
    }

    // Re-check for active/trial subscriptions inside the same serializable
    // transaction as the delete, so a subscription created concurrently
    // between the count above and this delete can't end up referencing a
    // deleted plan.
    try {
      await dbTransaction(async (tx) => {
        const stillActiveCount = await tx.subscription.count({
          where: { planId: id, status: { in: ['active', 'trial'] } },
        });
        if (stillActiveCount > 0) {
          throw new Error('PLAN_NOW_HAS_ACTIVE_SUBSCRIPTIONS');
        }
        await tx.subscriptionPlan.delete({ where: { id } });
      }, { isolationLevel: 'Serializable' });
    } catch (txError: unknown) {
      if (txError instanceof Error && txError.message === 'PLAN_NOW_HAS_ACTIVE_SUBSCRIPTIONS') {
        return NextResponse.json(
          { success: false, error: 'A subscription started referencing this plan; please retry the deletion.' },
          { status: 409 }
        );
      }
      throw txError;
    }

    if (tenantId) {
      await createAuditLog(request, {
        tenantId,
        userId: user.userId,
        action: AuditActions.DELETE,
        entityType: 'subscription_plan',
        entityId: plan.id,
        changes: { name: plan.name, tier: plan.tier },
        metadata: { deletedBy: user.userId, role: 'super_admin' },
      });
    }

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
