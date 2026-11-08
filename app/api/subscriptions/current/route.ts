import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Subscription from '@/models/Subscription';
import '@/models/SubscriptionPlan';
import User from '@/models/User';
import Branch from '@/models/Branch';
import Product from '@/models/Product';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { SubscriptionService } from '@/lib/subscription';
import { logger } from '@/lib/logger';
import { authErrorStatus } from '../auth-error-status';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { tenantId, user } = await requireTenantAccess(request);

    if (!(await hasTenantPermission(user.role, tenantId, 'subscriptions.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`read:subscriptions-current:${tenantId}:${ip}`, 60, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    // Get the current subscription for this tenant
    const subscription = await Subscription.findOne({ tenantId })
      .populate('planId', 'name tier price features birCompliance isCustom')
      .lean();

    if (subscription) {
      // The stored counters are only bumped when something is created, never when it is
      // deactivated or removed, so count what the plan limits actually check instead.
      const [users, branches, products, transactions] = await Promise.all([
        User.countDocuments({ tenantId, isActive: true }),
        Branch.countDocuments({ tenantId, isActive: true }),
        Product.countDocuments({ tenantId, isActive: true }),
        SubscriptionService.getMonthlyTransactionCount(String(tenantId)),
      ]);
      subscription.usage = {
        ...subscription.usage,
        currentUsers: users,
        currentBranches: branches,
        currentProducts: products,
        // null means no sale has been recorded this calendar month yet.
        currentTransactions: transactions ?? 0,
      };
    }

    return NextResponse.json({
      success: true,
      data: subscription,
    });

  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const authStatus = authErrorStatus(error);
    if (authStatus) {
      return NextResponse.json({ success: false, error: error.message }, { status: authStatus });
    }
    logger.error('Error fetching current subscription:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToFetchSubscription', 'Failed to fetch subscription') },
      { status: 500 }
    );
  }
}
