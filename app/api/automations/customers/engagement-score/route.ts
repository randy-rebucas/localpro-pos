import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { calculateEngagementScores } from '@/lib/automations/engagement-score';
import { handleApiError } from '@/lib/error-handler';

/**
 * POST /api/automations/customers/engagement-score
 * Cron: Recalculate engagement scores for all customers across all tenants.
 * Called once daily by the scheduler.
 * Requires Authorization: Bearer <CRON_SECRET>
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const targetTenantId = searchParams.get('tenantId');

    let tenantIds: string[];
    if (targetTenantId) {
      tenantIds = [targetTenantId];
    } else {
      const tenants = await Tenant.find({ isActive: true }).select('_id').lean();
      tenantIds = tenants.map((t: any) => t._id.toString()); // eslint-disable-line @typescript-eslint/no-explicit-any
    }

    let totalUpdated = 0;
    for (const tenantId of tenantIds) {
      const result = await calculateEngagementScores(tenantId);
      totalUpdated += result.updated;
    }

    return NextResponse.json({
      success: true,
      data: { tenantsProcessed: tenantIds.length, totalCustomersUpdated: totalUpdated },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Engagement score calculation failed');
  }
}
