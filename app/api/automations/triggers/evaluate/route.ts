import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { evaluateTriggers } from '@/lib/automations/trigger-engine';
import { handleApiError } from '@/lib/error-handler';

/**
 * POST /api/automations/triggers/evaluate
 * Cron: Evaluate all active automation triggers for all tenants.
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

    const allResults = [];
    for (const tenantId of tenantIds) {
      const results = await evaluateTriggers(tenantId);
      allResults.push({ tenantId, results });
    }

    const totalFired = allResults.reduce(
      (sum, t) => sum + t.results.reduce((s, r) => s + r.customersReached, 0),
      0
    );

    return NextResponse.json({
      success: true,
      data: { tenantsProcessed: tenantIds.length, totalFired, results: allResults },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Trigger evaluation failed');
  }
}
