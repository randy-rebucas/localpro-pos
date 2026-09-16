import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { SubscriptionService } from '@/lib/subscription';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const t = await getValidationTranslatorFromRequest(request);
  try {
    const user = await requireAuth(request);
    const tenantId = user.tenantId;

    const { subscription, created } = await SubscriptionService.ensureTrialSubscription(
      tenantId.toString()
    );

    return NextResponse.json(
      {
        success: true,
        data: subscription,
        created,
        alreadyExists: !created,
        message: created
          ? t('subscription.trialCreated', '14-day trial subscription created successfully')
          : t('subscription.trialAlreadyActive', 'Trial subscription already active'),
      },
      { status: created ? 201 : 200 }
    );
  } catch (error: unknown) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: t('validation.authenticationRequired', 'Authentication required') },
        { status: 401 }
      );
    }
    if ((error as Error).message === 'Starter plan not available') {
      return NextResponse.json(
        { success: false, error: t('subscription.starterPlanNotAvailable', 'Starter plan not available') },
        { status: 404 }
      );
    }
    logger.error('Error creating trial subscription:', error);
    return NextResponse.json(
      { success: false, error: t('subscription.trialCreationFailed', 'Failed to create trial subscription') },
      { status: 500 }
    );
  }
}
