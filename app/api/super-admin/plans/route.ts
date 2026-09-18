import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['super_admin']);

    const plans = await prisma.subscriptionPlan.findMany({
      orderBy: { priceMonthly: 'asc' },
    });

    // Attach active subscriber count to each plan
    const counts = await prisma.subscription.groupBy({
      by: ['planId'],
      where: { status: { in: ['active', 'trial'] } },
      _count: { _all: true },
    });
    const countMap = Object.fromEntries(counts.map(c => [c.planId, c._count._all]));
    const plansWithCounts = plans.map(p => ({ ...p, subscriberCount: countMap[p.id] || 0 }));

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

    const existing = await prisma.subscriptionPlan.findUnique({ where: { tier } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: `A plan with tier '${tier}' already exists` },
        { status: 409 }
      );
    }

    const plan = await prisma.subscriptionPlan.create({
      data: {
        id: randomUUID(),
        name,
        tier,
        description,
        priceMonthly: price.monthly,
        priceSetupFee: price.setupFee || 0,
        priceCurrency: price.currency || 'PHP',
        maxUsers: features?.maxUsers ?? 1,
        maxBranches: features?.maxBranches ?? 1,
        maxProducts: features?.maxProducts ?? 0,
        maxTransactions: features?.maxTransactions ?? 0,
        enableInventory: features?.enableInventory ?? true,
        enableCategories: features?.enableCategories ?? true,
        enableDiscounts: features?.enableDiscounts ?? false,
        enableLoyaltyProgram: features?.enableLoyaltyProgram ?? false,
        enableCustomerManagement: features?.enableCustomerManagement ?? false,
        enableBookingScheduling: features?.enableBookingScheduling ?? false,
        enableTableManagement: features?.enableTableManagement ?? false,
        enableReports: features?.enableReports ?? true,
        enableMultiBranch: features?.enableMultiBranch ?? false,
        enableHardwareIntegration: features?.enableHardwareIntegration ?? false,
        prioritySupport: features?.prioritySupport ?? false,
        customIntegrations: features?.customIntegrations ?? false,
        dedicatedAccountManager: features?.dedicatedAccountManager ?? false,
        birPtuAssistance: birCompliance?.ptuAssistance ?? false,
        birReceiptFormatting: birCompliance?.receiptFormatting ?? false,
        birDocumentation: birCompliance?.birDocumentation ?? false,
        birCasReporting: birCompliance?.casReporting ?? false,
        birAuditTrailSystem: birCompliance?.auditTrailSystem ?? false,
        birMonthlySupport: birCompliance?.monthlySupport ?? false,
        isActive: isActive !== undefined ? isActive : true,
        isCustom: isCustom || false,
        availableToNewTenants: availableToNewTenants !== undefined ? availableToNewTenants : true,
        yearlyDiscount: yearlyDiscount || 0,
      },
    });

    const defaultTenant = await prisma.tenant.findUnique({ where: { slug: 'default' }, select: { id: true } });
    if (defaultTenant) {
      await createAuditLog(request, {
        tenantId: defaultTenant.id,
        userId: user.userId,
        action: AuditActions.CREATE,
        entityType: 'subscription_plan',
        entityId: plan.id,
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
