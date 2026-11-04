import { NextResponse } from 'next/server';
import { getRepos } from '@/lib/db';
import { cacheWrap } from '@/lib/cache';

/**
 * Public aggregate counts for marketing / trust strip (no PII).
 * GET /api/public/platform-stats
 */
export async function GET() {
  try {
    // The transaction count scans the whole collection (no tenant prefix to use
    // an index), so it's cached per instance on top of the CDN cache below.
    const [activeTenants, completedTransactions] = await cacheWrap('public:platform-stats', 10 * 60 * 1000, async () => {
      return Promise.all([
        getRepos().tenants.countActive(),
        getRepos().transactions.countAcrossTenants({ status: 'completed', isActive: true }),
      ]);
    });

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
