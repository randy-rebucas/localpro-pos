import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireRole, getCurrentUser } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import type { Prisma } from '@prisma/client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const plan = await prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!plan) {
      return NextResponse.json(
        { success: false, error: 'Subscription plan not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: plan });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
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

    const plan = await prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!plan) {
      return NextResponse.json(
        { success: false, error: 'Subscription plan not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { name, description, price, features, birCompliance, isActive, isCustom } = body;

    const changes: Prisma.SubscriptionPlanUpdateInput = {};

    if (name !== undefined) changes.name = name;
    if (description !== undefined) changes.description = description;

    if (price !== undefined) {
      changes.priceMonthly = price.monthly ?? plan.priceMonthly;
      changes.priceSetupFee = price.setupFee ?? plan.priceSetupFee ?? 0;
      changes.priceCurrency = price.currency ?? plan.priceCurrency;
    }

    if (features !== undefined) {
      changes.maxUsers = features.maxUsers ?? plan.maxUsers;
      changes.maxBranches = features.maxBranches ?? plan.maxBranches;
      changes.maxProducts = features.maxProducts ?? plan.maxProducts;
      changes.maxTransactions = features.maxTransactions ?? plan.maxTransactions;
      changes.enableInventory = features.enableInventory ?? plan.enableInventory;
      changes.enableCategories = features.enableCategories ?? plan.enableCategories;
      changes.enableDiscounts = features.enableDiscounts ?? plan.enableDiscounts;
      changes.enableLoyaltyProgram = features.enableLoyaltyProgram ?? plan.enableLoyaltyProgram;
      changes.enableCustomerManagement = features.enableCustomerManagement ?? plan.enableCustomerManagement;
      changes.enableBookingScheduling = features.enableBookingScheduling ?? plan.enableBookingScheduling;
      changes.enableReports = features.enableReports ?? plan.enableReports;
      changes.enableMultiBranch = features.enableMultiBranch ?? plan.enableMultiBranch;
      changes.enableHardwareIntegration = features.enableHardwareIntegration ?? plan.enableHardwareIntegration;
      changes.prioritySupport = features.prioritySupport ?? plan.prioritySupport;
      changes.customIntegrations = features.customIntegrations ?? plan.customIntegrations;
      changes.dedicatedAccountManager = features.dedicatedAccountManager ?? plan.dedicatedAccountManager;
    }

    if (birCompliance !== undefined) {
      changes.birPtuAssistance = birCompliance.ptuAssistance ?? plan.birPtuAssistance ?? false;
      changes.birReceiptFormatting = birCompliance.receiptFormatting ?? plan.birReceiptFormatting ?? false;
      changes.birDocumentation = birCompliance.birDocumentation ?? plan.birDocumentation ?? false;
      changes.birCasReporting = birCompliance.casReporting ?? plan.birCasReporting ?? false;
      changes.birAuditTrailSystem = birCompliance.auditTrailSystem ?? plan.birAuditTrailSystem ?? false;
      changes.birMonthlySupport = birCompliance.monthlySupport ?? plan.birMonthlySupport ?? false;
    }

    if (typeof isActive === 'boolean') changes.isActive = isActive;
    if (typeof isCustom === 'boolean') changes.isCustom = isCustom;

    if (Object.keys(changes).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No changes provided' },
        { status: 400 }
      );
    }

    const updatedPlan = await prisma.subscriptionPlan.update({
      where: { id },
      data: changes,
    });

    await createAuditLog(request, {
      tenantId: currentUser?.tenantId || '',
      userId: currentUser?.userId,
      action: AuditActions.UPDATE,
      entityType: 'subscription_plan',
      entityId: id,
      changes,
    });

    return NextResponse.json({ success: true, data: updatedPlan });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2002') {
      return NextResponse.json(
        { success: false, error: 'Plan tier already exists' },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 400 });
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

    const plan = await prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!plan) {
      return NextResponse.json(
        { success: false, error: 'Subscription plan not found' },
        { status: 404 }
      );
    }

    // Check if any active subscriptions use this plan
    const activeCount = await prisma.subscription.count({
      where: { planId: id, status: { in: ['active', 'trial'] } },
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
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 400 });
  }
}
