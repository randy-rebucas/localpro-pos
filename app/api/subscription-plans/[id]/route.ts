import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole, getCurrentUser } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getSubscriptionPlanById, planToApi } from '@/lib/data/subscription-plans';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const plan = await getSubscriptionPlanById(id);
    if (!plan) {
      return NextResponse.json(
        { success: false, error: 'Subscription plan not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: planToApi(plan) });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(request, ['super_admin']); // global plan catalog — super_admin only
    const currentUser = await getCurrentUser(request);
    const { id } = await params;

    const plan = await getSubscriptionPlanById(id);
    if (!plan) {
      return NextResponse.json(
        { success: false, error: 'Subscription plan not found' },
        { status: 404 }
      );
    }

    const planFeatures = plan.features as Record<string, unknown>;
    const planBirCompliance = (plan.birCompliance || {}) as Record<string, unknown>;

    const body = await request.json();
    const { name, description, price, features, birCompliance, isActive, isCustom } = body;

    const changes: Record<string, unknown> = {};
    const data: Record<string, unknown> = {};

    if (name !== undefined) {
      data.name = name;
      changes.name = name;
    }

    if (description !== undefined) {
      data.description = description;
      changes.description = description;
    }

    if (price !== undefined) {
      data.priceMonthly = price.monthly ?? plan.priceMonthly;
      data.priceSetupFee = price.setupFee ?? plan.priceSetupFee ?? 0;
      data.priceCurrency = price.currency ?? plan.priceCurrency;
      changes.price = {
        monthly: price.monthly ?? Number(plan.priceMonthly),
        setupFee: price.setupFee ?? Number(plan.priceSetupFee ?? 0),
        currency: price.currency ?? plan.priceCurrency,
      };
    }

    if (features !== undefined) {
      const merged = {
        maxUsers: features.maxUsers ?? planFeatures.maxUsers,
        maxBranches: features.maxBranches ?? planFeatures.maxBranches,
        maxProducts: features.maxProducts ?? planFeatures.maxProducts,
        maxTransactions: features.maxTransactions ?? planFeatures.maxTransactions,
        enableInventory: features.enableInventory ?? planFeatures.enableInventory,
        enableCategories: features.enableCategories ?? planFeatures.enableCategories,
        enableDiscounts: features.enableDiscounts ?? planFeatures.enableDiscounts,
        enableLoyaltyProgram: features.enableLoyaltyProgram ?? planFeatures.enableLoyaltyProgram,
        enableCustomerManagement: features.enableCustomerManagement ?? planFeatures.enableCustomerManagement,
        enableBookingScheduling: features.enableBookingScheduling ?? planFeatures.enableBookingScheduling,
        enableReports: features.enableReports ?? planFeatures.enableReports,
        enableMultiBranch: features.enableMultiBranch ?? planFeatures.enableMultiBranch,
        enableHardwareIntegration: features.enableHardwareIntegration ?? planFeatures.enableHardwareIntegration,
        prioritySupport: features.prioritySupport ?? planFeatures.prioritySupport,
        customIntegrations: features.customIntegrations ?? planFeatures.customIntegrations,
        dedicatedAccountManager: features.dedicatedAccountManager ?? planFeatures.dedicatedAccountManager,
      };
      data.features = merged;
      changes.features = merged;
    }

    if (birCompliance !== undefined) {
      const merged = {
        ptuAssistance: birCompliance.ptuAssistance ?? planBirCompliance.ptuAssistance ?? false,
        receiptFormatting: birCompliance.receiptFormatting ?? planBirCompliance.receiptFormatting ?? false,
        birDocumentation: birCompliance.birDocumentation ?? planBirCompliance.birDocumentation ?? false,
        casReporting: birCompliance.casReporting ?? planBirCompliance.casReporting ?? false,
        auditTrailSystem: birCompliance.auditTrailSystem ?? planBirCompliance.auditTrailSystem ?? false,
        monthlySupport: birCompliance.monthlySupport ?? planBirCompliance.monthlySupport ?? false,
      };
      data.birCompliance = merged;
      changes.birCompliance = merged;
    }

    if (typeof isActive === 'boolean') {
      data.isActive = isActive;
      changes.isActive = isActive;
    }

    if (typeof isCustom === 'boolean') {
      data.isCustom = isCustom;
      changes.isCustom = isCustom;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No changes provided' },
        { status: 400 }
      );
    }

    const updatedPlan = await prisma.subscriptionPlan.update({
      where: { id },
      data,
    });

    await createAuditLog(request, {
      tenantId: currentUser?.tenantId || '',
      userId: currentUser?.userId,
      action: AuditActions.UPDATE,
      entityType: 'subscription_plan',
      entityId: id,
      changes,
    });

    return NextResponse.json({ success: true, data: planToApi(updatedPlan) });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (error.code === 'P2002') {
      return NextResponse.json(
        { success: false, error: 'Plan tier already exists' },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(request, ['super_admin']); // global plan catalog — super_admin only
    const deleteUser = await getCurrentUser(request);
    const { id } = await params;

    const plan = await getSubscriptionPlanById(id);
    if (!plan) {
      return NextResponse.json(
        { success: false, error: 'Subscription plan not found' },
        { status: 404 }
      );
    }

    // Check if any active subscriptions use this plan
    const activeCount = await prisma.subscription.count({
      where: {
        planId: id,
        status: { in: ['active', 'trial'] },
      },
    });

    if (activeCount > 0) {
      // Soft delete — deactivate instead of removing
      await prisma.subscriptionPlan.update({ where: { id }, data: { isActive: false } });

      await createAuditLog(request, {
        tenantId: deleteUser?.tenantId || '',
        userId: deleteUser?.userId,
        action: AuditActions.UPDATE,
        entityType: 'subscription_plan',
        entityId: id,
        changes: { isActive: { old: true, new: false } },
        metadata: { reason: `Deactivated: ${activeCount} active subscriptions using this plan` },
      });

      return NextResponse.json({
        success: true,
        message: `Plan deactivated (${activeCount} active subscriptions still using it)`,
      });
    }

    // Hard delete if no active subscriptions
    await prisma.subscriptionPlan.delete({ where: { id } });

    await createAuditLog(request, {
      tenantId: deleteUser?.tenantId || '',
      userId: deleteUser?.userId,
      action: AuditActions.DELETE,
      entityType: 'subscription_plan',
      entityId: id,
      changes: { deleted: true, planName: plan.name, planTier: plan.tier },
    });

    return NextResponse.json({ success: true, message: 'Subscription plan deleted' });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
