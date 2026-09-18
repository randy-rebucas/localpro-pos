import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/db';
import { requireRole } from '@/lib/auth';

export async function GET(request: NextRequest) { // eslint-disable-line @typescript-eslint/no-unused-vars
  try {
    // This route has no auth/tenant context, so it can't tell a grandfathered
    // subscriber apart from a first-time browser — it returns all active plans
    // (SubscriptionPlan is a global catalog, not tenant-scoped) and leaves the
    // availableToNewTenants decision to callers that *do* know the requesting
    // tenant's current plan (see subscription/page.tsx).
    const plans = await prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { priceMonthly: 'asc' },
    });

    return NextResponse.json({ success: true, data: plans });
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

    const plan = await prisma.subscriptionPlan.create({
      data: {
        id: randomUUID(),
        name,
        tier,
        description,
        priceMonthly: price.monthly,
        priceSetupFee: price.setupFee || 0,
        priceCurrency: price.currency || 'PHP',
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
        birPtuAssistance: birCompliance?.ptuAssistance ?? false,
        birReceiptFormatting: birCompliance?.receiptFormatting ?? false,
        birDocumentation: birCompliance?.birDocumentation ?? false,
        birCasReporting: birCompliance?.casReporting ?? false,
        birAuditTrailSystem: birCompliance?.auditTrailSystem ?? false,
        birMonthlySupport: birCompliance?.monthlySupport ?? false,
        isActive: true,
        isCustom,
      },
    });

    return NextResponse.json({ success: true, data: plan }, { status: 201 });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2002') {
      return NextResponse.json(
        { success: false, error: 'Plan tier already exists' },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: false, error: 'Failed to create plan' }, { status: 400 });
  }
}
