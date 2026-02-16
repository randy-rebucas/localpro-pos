import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SubscriptionPlan from '@/models/SubscriptionPlan';
import { requireRole } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const plans = await SubscriptionPlan.find({ isActive: true })
      .sort({ 'price.monthly': 1 })
      .lean();

    return NextResponse.json({ success: true, data: plans });
  } catch (_error: unknown) {
    return NextResponse.json({ success: false, error: 'Failed to fetch plans' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    await requireRole(request, ['admin']);

    const body = await request.json();
    const { name, tier, description, price, features, isCustom = false } = body;

    if (!name || !tier || !price?.monthly) {
      return NextResponse.json(
        { success: false, error: 'Name, tier, and monthly price are required' },
        { status: 400 }
      );
    }

    // Check if tier already exists
    const existingPlan = await SubscriptionPlan.findOne({ tier });
    if (existingPlan) {
      return NextResponse.json(
        { success: false, error: 'A plan with this tier already exists' },
        { status: 400 }
      );
    }

    const planData = {
      name,
      tier,
      description,
      price: {
        monthly: price.monthly,
        currency: price.currency || 'PHP',
      },
      features: {
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
      },
      isActive: true,
      isCustom,
    };

    const plan = await SubscriptionPlan.create(planData);

    return NextResponse.json({ success: true, data: plan }, { status: 201 });
  } catch (error: unknown) {
    if ((error as Record<string, unknown>).code === 11000) {
      return NextResponse.json(
        { success: false, error: 'Plan tier already exists' },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: false, error: 'Failed to create plan' }, { status: 400 });
  }
}