import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import Transaction from '@/models/Transaction';
import { TENANT_IS_ACTIVE_FILTER } from '@/lib/tenant-active-query';

/**
 * Public aggregate counts for marketing / trust strip (no PII).
 * GET /api/public/platform-stats
 */
export async function GET() {
  try {
    await connectDB();
    const [activeTenants, completedTransactions] = await Promise.all([
      Tenant.countDocuments(TENANT_IS_ACTIVE_FILTER),
      Transaction.countDocuments({ status: 'completed', isActive: true }),
    ]);

    return NextResponse.json(
      {
        success: true,
        data: {
          activeTenants,
          completedTransactions,
        },
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300',
        },
      }
    );
  } catch {
    return NextResponse.json({ success: false, error: 'Unavailable' }, { status: 503 });
  }
}
