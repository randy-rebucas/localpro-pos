import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Subscription from '@/models/Subscription';
import { requireAuth } from '@/lib/auth';
import { getTenantIdFromRequest } from '@/lib/api-tenant';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    // Require authentication
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found' },
        { status: 404 }
      );
    }

    // Get the current subscription for this tenant
    const subscription = await Subscription.findOne({ tenantId })
      .populate('planId', 'name tier price features')
      .lean();

    return NextResponse.json({
      success: true,
      data: subscription,
    });

  } catch (error: any) {
    console.error('Error fetching current subscription:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}