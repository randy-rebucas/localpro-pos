import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Subscription from '@/models/Subscription';
import { requireAuth } from '@/lib/auth';
import { getTenantIdFromRequest } from '@/lib/api-tenant';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    // Require authentication
    const user = await requireAuth(request); // eslint-disable-line @typescript-eslint/no-unused-vars
    const tenantId = await getTenantIdFromRequest(request);

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found' },
        { status: 404 }
      );
    }

    // Get the current subscription for this tenant
    const subscription = await Subscription.findOne({ tenantId }).lean();

    if (!subscription) {
      return NextResponse.json({
        success: true,
        data: [],
      });
    }

    // For now, we'll return the billing history from the subscription
    // In a real implementation, this would be a separate BillingHistory collection
    const billingHistory = subscription.billingHistory || [];

    // Transform the billing history to include proper date formatting
    const formattedHistory = billingHistory.map((billing: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      _id: billing._id,
      amount: billing.amount,
      currency: billing.currency || 'PHP',
      status: billing.status || 'paid',
      billingCycle: billing.billingCycle || subscription.billingCycle,
      periodStart: billing.periodStart,
      periodEnd: billing.periodEnd,
      createdAt: billing.createdAt || billing.date,
      description: billing.description,
    }));

    return NextResponse.json({
      success: true,
      data: formattedHistory,
    });

  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Error fetching billing history:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}