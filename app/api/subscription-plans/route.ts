import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { getActiveSubscriptionPlans, planToApi } from '@/lib/data/subscription-plans';

export async function GET(request: NextRequest) { // eslint-disable-line @typescript-eslint/no-unused-vars
  try {
    const plans = await getActiveSubscriptionPlans();

    return NextResponse.json({ success: true, data: plans.map(planToApi) });
  } catch (_error: unknown) {
    return NextResponse.json({ success: false, error: 'Failed to fetch plans' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Creating a global subscription plan tier (visible to every tenant) — super_admin only
    await requireRole(request, ['super_admin']);

    const body = await request.json();
    const { name, tier, description, price, features, birCompliance, isCustom = false } = body;

    if (!name || !tier || !price?.monthly) {
      return NextResponse.json(
        { success: false, error: 'Name, tier, and monthly price are required' },
        { status: 400 }
      );
    }

    // Check if tier already exists
    const existingPlan = await prisma.subscriptionPlan.findUnique({ where: { tier } });
    if (existingPlan) {
      return NextResponse.json(
        { success: false, error: 'A plan with this tier already exists' },
        { status: 400 }
      );
    }

    const featuresData = {
      maxUsers: features?.maxUsers || 1,
      maxBranches: features?.maxBranches || 1,
      maxProducts: features?.maxProducts || 0,
      maxTransactions: features?.maxTransactions || 0,
      enableInventory: features?.enableInventory ?? true,
      enableCategories: features?.enableCategories ?? true,
      enableDiscounts: features?.enableDiscounts ?? false,
      enableLoyaltyProgram: features?.enableLoyaltyProgram ?? false,
      enableCustomerManagement: features?.enableCustomerManagement ?? false,
      enableBookingScheduling: features?.enableBookingScheduling ?? false,
      enableReports: features?.enableReports ?? true,
      enableMultiBranch: features?.enableMultiBranch ?? false,
      enableHardwareIntegration: features?.enableHardwareIntegration ?? false,
      prioritySupport: features?.prioritySupport ?? false,
      customIntegrations: features?.customIntegrations ?? false,
      dedicatedAccountManager: features?.dedicatedAccountManager ?? false,
    };

    const birComplianceData = {
      ptuAssistance: birCompliance?.ptuAssistance ?? false,
      receiptFormatting: birCompliance?.receiptFormatting ?? false,
      birDocumentation: birCompliance?.birDocumentation ?? false,
      casReporting: birCompliance?.casReporting ?? false,
      auditTrailSystem: birCompliance?.auditTrailSystem ?? false,
      monthlySupport: birCompliance?.monthlySupport ?? false,
    };

    const plan = await prisma.subscriptionPlan.create({
      data: {
        name,
        tier,
        description,
        priceMonthly: price.monthly,
        priceSetupFee: price.setupFee || 0,
        priceCurrency: price.currency || 'PHP',
        features: featuresData,
        birCompliance: birComplianceData,
        isActive: true,
        isCustom,
      },
    });

    return NextResponse.json({ success: true, data: planToApi(plan) }, { status: 201 });
  } catch (error: unknown) {
    if ((error as Record<string, unknown>).code === 'P2002') {
      return NextResponse.json(
        { success: false, error: 'Plan tier already exists' },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: false, error: 'Failed to create plan' }, { status: 400 });
  }
}
