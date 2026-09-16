import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Subscription from '@/models/Subscription';
import SubscriptionPlan from '@/models/SubscriptionPlan';
import Tenant from '@/models/Tenant'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { requireAuth } from '@/lib/auth';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const t = await getValidationTranslatorFromRequest(request);

    // Require authentication for upgrade requests
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { currentPlan, requestedPlan, planId } = body;

    if (!planId) {
      return NextResponse.json(
        { success: false, error: t('validation.planIdRequired', 'Plan ID is required') },
        { status: 400 }
      );
    }

    // Verify the requested plan exists and is active
    const requestedPlanDoc = await SubscriptionPlan.findOne({ _id: planId, isActive: true });
    if (!requestedPlanDoc) {
      return NextResponse.json(
        { success: false, error: t('validation.requestedPlanNotFound', 'Requested plan not found or not available') },
        { status: 404 }
      );
    }

    // Get current subscription
    const currentSubscription = await Subscription.findOne({ tenantId })
      .populate('planId', 'name tier')
      .lean();

    if (!currentSubscription) {
      return NextResponse.json(
        { success: false, error: t('validation.noActiveSubscription', 'No active subscription found') },
        { status: 404 }
      );
    }

    // Check if already on this plan
    if (currentSubscription.planId._id.toString() === planId) {
      return NextResponse.json(
        { success: false, error: t('validation.alreadyOnPlan', 'You are already on this plan') },
        { status: 400 }
      );
    }

    // Create upgrade request (in a real app, this might send an email or create a ticket)
    // For now, we'll just log it and return success
    logger.info('Upgrade Request:', {
      tenantId,
      userId: user.userId,
      currentPlan: currentPlan,
      requestedPlan: requestedPlan,
      planId: planId,
      requestedAt: new Date(),
    });

    // In a production system, you might want to:
    // 1. Send an email to admins
    // 2. Create an upgrade request record in the database
    // 3. Send confirmation email to user
    // 4. Trigger payment flow if applicable

    return NextResponse.json({
      success: true,
      message: t('subscription.upgradeRequestSubmitted', 'Upgrade request submitted successfully'),
      data: {
        currentPlan,
        requestedPlan,
        requestedAt: new Date(),
      },
    });

  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error requesting upgrade:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.upgradeRequestFailed', 'Failed to submit upgrade request') },
      { status: 500 }
    );
  }
}