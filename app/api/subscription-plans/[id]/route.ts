import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SubscriptionPlan from '@/models/SubscriptionPlan';
import { requireRole, getCurrentUser } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await params;

    const plan = await SubscriptionPlan.findById(id).lean();
    if (!plan) {
      return NextResponse.json(
        { success: false, error: 'Subscription plan not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: plan });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    await requireRole(request, ['admin']);
    const currentUser = await getCurrentUser(request);
    const { id } = await params;

    const plan = await SubscriptionPlan.findById(id);
    if (!plan) {
      return NextResponse.json(
        { success: false, error: 'Subscription plan not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { name, description, price, features, birCompliance, isActive, isCustom } = body;

    const changes: Record<string, unknown> = {};

    if (name !== undefined) {
      changes.name = name;
    }

    if (description !== undefined) {
      changes.description = description;
    }

    if (price !== undefined) {
      changes.price = {
        monthly: price.monthly ?? plan.price.monthly,
        setupFee: price.setupFee ?? plan.price.setupFee ?? 0,
        currency: price.currency ?? plan.price.currency,
      };
    }

    if (features !== undefined) {
      changes.features = {
        maxUsers: features.maxUsers ?? plan.features.maxUsers,
        maxBranches: features.maxBranches ?? plan.features.maxBranches,
        maxProducts: features.maxProducts ?? plan.features.maxProducts,
        maxTransactions: features.maxTransactions ?? plan.features.maxTransactions,
        enableInventory: features.enableInventory ?? plan.features.enableInventory,
        enableCategories: features.enableCategories ?? plan.features.enableCategories,
        enableDiscounts: features.enableDiscounts ?? plan.features.enableDiscounts,
        enableLoyaltyProgram: features.enableLoyaltyProgram ?? plan.features.enableLoyaltyProgram,
        enableCustomerManagement: features.enableCustomerManagement ?? plan.features.enableCustomerManagement,
        enableBookingScheduling: features.enableBookingScheduling ?? plan.features.enableBookingScheduling,
        enableReports: features.enableReports ?? plan.features.enableReports,
        enableMultiBranch: features.enableMultiBranch ?? plan.features.enableMultiBranch,
        enableHardwareIntegration: features.enableHardwareIntegration ?? plan.features.enableHardwareIntegration,
        prioritySupport: features.prioritySupport ?? plan.features.prioritySupport,
        customIntegrations: features.customIntegrations ?? plan.features.customIntegrations,
        dedicatedAccountManager: features.dedicatedAccountManager ?? plan.features.dedicatedAccountManager,
      };
    }

    if (birCompliance !== undefined) {
      changes.birCompliance = {
        ptuAssistance: birCompliance.ptuAssistance ?? plan.birCompliance?.ptuAssistance ?? false,
        receiptFormatting: birCompliance.receiptFormatting ?? plan.birCompliance?.receiptFormatting ?? false,
        birDocumentation: birCompliance.birDocumentation ?? plan.birCompliance?.birDocumentation ?? false,
        casReporting: birCompliance.casReporting ?? plan.birCompliance?.casReporting ?? false,
        auditTrailSystem: birCompliance.auditTrailSystem ?? plan.birCompliance?.auditTrailSystem ?? false,
        monthlySupport: birCompliance.monthlySupport ?? plan.birCompliance?.monthlySupport ?? false,
      };
    }

    if (typeof isActive === 'boolean') {
      changes.isActive = isActive;
    }

    if (typeof isCustom === 'boolean') {
      changes.isCustom = isCustom;
    }

    if (Object.keys(changes).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No changes provided' },
        { status: 400 }
      );
    }

    const updatedPlan = await SubscriptionPlan.findByIdAndUpdate(
      id,
      changes,
      { new: true, runValidators: true }
    ).lean();

    await createAuditLog(request, {
      tenantId: currentUser?.tenantId || '',
      action: AuditActions.UPDATE,
      entityType: 'subscription_plan',
      entityId: id,
      changes,
    });

    return NextResponse.json({ success: true, data: updatedPlan });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (error.code === 11000) {
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
    await connectDB();
    await requireRole(request, ['admin']);
    const deleteUser = await getCurrentUser(request);
    const { id } = await params;

    const plan = await SubscriptionPlan.findById(id);
    if (!plan) {
      return NextResponse.json(
        { success: false, error: 'Subscription plan not found' },
        { status: 404 }
      );
    }

    // Check if any active subscriptions use this plan
    const Subscription = (await import('@/models/Subscription')).default;
    const activeCount = await Subscription.countDocuments({
      planId: id,
      status: { $in: ['active', 'trial'] },
    });

    if (activeCount > 0) {
      // Soft delete — deactivate instead of removing
      await SubscriptionPlan.findByIdAndUpdate(id, { isActive: false });

      await createAuditLog(request, {
        tenantId: deleteUser?.tenantId || '',
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
    await SubscriptionPlan.findByIdAndDelete(id);

    await createAuditLog(request, {
      tenantId: deleteUser?.tenantId || '',
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
