import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * Public aggregate counts for marketing / trust strip (no PII).
 * GET /api/public/platform-stats
 */
export async function GET() {
  try {
    const [activeTenants, completedTransactions] = await Promise.all([
      prisma.tenant.count({ where: { isActive: true } }),
      prisma.transaction.count({ where: { status: 'completed', isActive: true } }),
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
