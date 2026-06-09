import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SubscriptionPlan from '@/models/SubscriptionPlan';
import Subscription from '@/models/Subscription';
import { requireRole } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    await requireRole(request, ['super_admin']);

    const plans = await SubscriptionPlan.find({})
      .sort({ 'price.monthly': 1 })
      .lean();

    // Attach active subscriber count to each plan
    const counts = await Subscription.aggregate([
      { $match: { status: { $in: ['active', 'trial'] } } },
      { $group: { _id: '$planId', count: { $sum: 1 } } },
    ]);
    const countMap = Object.fromEntries(counts.map(c => [String(c._id), c.count]));
    const plansWithCounts = plans.map(p => ({ ...p, subscriberCount: countMap[String(p._id)] || 0 }));

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
    await connectDB();
    await requireRole(request, ['super_admin']);

    const body = await request.json();
    const { name, tier, description, price, features, birCompliance, isActive, isCustom, availableToNewTenants, yearlyDiscount } = body;

    if (!name || !tier || price?.monthly === undefined) {
      return NextResponse.json(
        { success: false, error: 'name, tier, and price.monthly are required' },
        { status: 400 }
      );
    }

    const existing = await SubscriptionPlan.findOne({ tier });
    if (existing) {
      return NextResponse.json(
        { success: false, error: `A plan with tier '${tier}' already exists` },
        { status: 409 }
      );
    }

    const plan = await SubscriptionPlan.create({
      name,
      tier,
      description,
      price,
      features,
      birCompliance,
      isActive: isActive !== undefined ? isActive : true,
      isCustom: isCustom || false,
      availableToNewTenants: availableToNewTenants !== undefined ? availableToNewTenants : true,
      yearlyDiscount: yearlyDiscount || 0,
    });

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
