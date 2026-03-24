import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SubscriptionPlan from '@/models/SubscriptionPlan';
import { requireRole } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';

const DEFAULT_PLANS = [
  {
    tier: 'starter',
    name: 'Starter',
    description: 'Perfect for small businesses getting started.',
    price: { monthly: 0, setupFee: 0, currency: 'PHP' },
    features: {
      maxUsers: 2,
      maxBranches: 1,
      maxProducts: 100,
      maxTransactions: 500,
      enableInventory: true,
      enableCategories: true,
      enableDiscounts: false,
      enableLoyaltyProgram: false,
      enableCustomerManagement: false,
      enableBookingScheduling: false,
      enableReports: true,
      enableMultiBranch: false,
      enableHardwareIntegration: false,
      prioritySupport: false,
      customIntegrations: false,
      dedicatedAccountManager: false,
    },
    birCompliance: {
      ptuAssistance: false,
      receiptFormatting: false,
      birDocumentation: false,
      casReporting: false,
      auditTrailSystem: false,
      monthlySupport: false,
    },
    isActive: true,
    isCustom: false,
  },
  {
    tier: 'pro',
    name: 'Pro',
    description: 'For growing businesses that need more power.',
    price: { monthly: 999, setupFee: 0, currency: 'PHP' },
    features: {
      maxUsers: 10,
      maxBranches: 3,
      maxProducts: 1000,
      maxTransactions: 5000,
      enableInventory: true,
      enableCategories: true,
      enableDiscounts: true,
      enableLoyaltyProgram: true,
      enableCustomerManagement: true,
      enableBookingScheduling: false,
      enableReports: true,
      enableMultiBranch: true,
      enableHardwareIntegration: true,
      prioritySupport: false,
      customIntegrations: false,
      dedicatedAccountManager: false,
    },
    birCompliance: {
      ptuAssistance: true,
      receiptFormatting: true,
      birDocumentation: false,
      casReporting: false,
      auditTrailSystem: true,
      monthlySupport: false,
    },
    isActive: true,
    isCustom: false,
  },
  {
    tier: 'business',
    name: 'Business',
    description: 'For established businesses with full compliance needs.',
    price: { monthly: 2499, setupFee: 0, currency: 'PHP' },
    features: {
      maxUsers: 50,
      maxBranches: 10,
      maxProducts: 10000,
      maxTransactions: 50000,
      enableInventory: true,
      enableCategories: true,
      enableDiscounts: true,
      enableLoyaltyProgram: true,
      enableCustomerManagement: true,
      enableBookingScheduling: true,
      enableReports: true,
      enableMultiBranch: true,
      enableHardwareIntegration: true,
      prioritySupport: true,
      customIntegrations: false,
      dedicatedAccountManager: false,
    },
    birCompliance: {
      ptuAssistance: true,
      receiptFormatting: true,
      birDocumentation: true,
      casReporting: true,
      auditTrailSystem: true,
      monthlySupport: true,
    },
    isActive: true,
    isCustom: false,
  },
  {
    tier: 'enterprise',
    name: 'Enterprise',
    description: 'Unlimited scale with dedicated support.',
    price: { monthly: 9999, setupFee: 0, currency: 'PHP' },
    features: {
      maxUsers: -1,
      maxBranches: -1,
      maxProducts: -1,
      maxTransactions: -1,
      enableInventory: true,
      enableCategories: true,
      enableDiscounts: true,
      enableLoyaltyProgram: true,
      enableCustomerManagement: true,
      enableBookingScheduling: true,
      enableReports: true,
      enableMultiBranch: true,
      enableHardwareIntegration: true,
      prioritySupport: true,
      customIntegrations: true,
      dedicatedAccountManager: true,
    },
    birCompliance: {
      ptuAssistance: true,
      receiptFormatting: true,
      birDocumentation: true,
      casReporting: true,
      auditTrailSystem: true,
      monthlySupport: true,
    },
    isActive: true,
    isCustom: false,
  },
];

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    await requireRole(request, ['super_admin']);

    const body = await request.json();
    const { target } = body;

    if (!target || !['plans', 'all'].includes(target)) {
      return NextResponse.json(
        { success: false, error: "target must be 'plans' or 'all'" },
        { status: 400 }
      );
    }

    const seeded: string[] = [];

    if (target === 'plans' || target === 'all') {
      for (const planData of DEFAULT_PLANS) {
        await SubscriptionPlan.findOneAndUpdate(
          { tier: planData.tier },
          { $set: planData },
          { upsert: true, new: true, runValidators: true }
        );
        seeded.push(`plan:${planData.tier}`);
      }
    }

    return NextResponse.json({ success: true, seeded });
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
