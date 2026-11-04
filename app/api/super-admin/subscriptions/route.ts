import { NextRequest, NextResponse } from 'next/server';
import { getRepos, type SubscriptionFilter, type SubscriptionStatus } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['super_admin']);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || '';
    const tenantSlug = searchParams.get('tenantSlug') || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')));

    // Build query
    const query: SubscriptionFilter = {};
    if (status) query.status = status as SubscriptionStatus;

    // If filtering by tenantSlug, resolve tenantId first
    if (tenantSlug) {
      const tenant = await getRepos().tenants.findBySlug(tenantSlug, { select: '_id' });
      if (tenant) {
        query.tenantId = tenant._id;
      } else {
        return NextResponse.json({ success: true, data: [], pagination: { page, limit, total: 0, pages: 0 } });
      }
    }

    const { items: subscriptions, total } = await getRepos().subscriptions.listAcrossTenants(query, {
      page: { skip: (page - 1) * limit, limit },
      populate: { tenant: 'slug name', plan: 'name tier' },
      omitBillingHistory: true,
    });

    return NextResponse.json({
      success: true,
      data: subscriptions,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    return handleApiError(error);
  }
}
