import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Subscription from '@/models/Subscription';
import Tenant from '@/models/Tenant';
import { requireRole } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    await requireRole(request, ['super_admin']);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || '';
    const tenantSlug = searchParams.get('tenantSlug') || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')));

    // Build query
    const query: Record<string, unknown> = {};
    if (status) query.status = status;

    // If filtering by tenantSlug, resolve tenantId first
    if (tenantSlug) {
      const tenant = await Tenant.findOne({ slug: tenantSlug }).select('_id').lean();
      if (tenant) {
        query.tenantId = (tenant as { _id: unknown })._id;
      } else {
        return NextResponse.json({ success: true, data: [], pagination: { page, limit, total: 0, pages: 0 } });
      }
    }

    const [subscriptions, total] = await Promise.all([
      Subscription.find(query)
        .populate('tenantId', 'slug name')
        .populate('planId', 'name tier')
        .select('-billingHistory')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Subscription.countDocuments(query),
    ]);

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
