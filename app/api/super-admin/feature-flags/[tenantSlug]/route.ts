import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import FeatureFlagOverride from '@/models/FeatureFlagOverride';
import SuperAdminAction from '@/models/SuperAdminAction';
import { requireRole } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';

async function resolveTenant(slug: string) {
  return Tenant.findOne({ slug }).select('_id slug name').lean() as Promise<{ _id: unknown; slug: string; name: string } | null>;
}

// GET /api/super-admin/feature-flags/[tenantSlug]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> }
) {
  try {
    await connectDB();
    await requireRole(request, ['super_admin']);

    const { tenantSlug } = await params;
    const tenant = await resolveTenant(tenantSlug);
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const overrides = await FeatureFlagOverride.find({ tenantId: tenant._id })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ success: true, data: overrides });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    return handleApiError(error);
  }
}

// POST /api/super-admin/feature-flags/[tenantSlug]
// Body: { feature, enabled, reason?, expiresAt? }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> }
) {
  try {
    await connectDB();
    const adminUser = await requireRole(request, ['super_admin']);

    const { tenantSlug } = await params;
    const tenant = await resolveTenant(tenantSlug);
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const body = await request.json();
    const { feature, enabled, reason, expiresAt } = body;

    if (!feature || typeof enabled !== 'boolean') {
      return NextResponse.json({ success: false, error: 'feature and enabled are required' }, { status: 400 });
    }

    const override = await FeatureFlagOverride.findOneAndUpdate(
      { tenantId: tenant._id, feature },
      {
        tenantId: tenant._id,
        feature,
        enabled,
        reason: reason || undefined,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        grantedBy: adminUser.userId,
      },
      { upsert: true, new: true }
    );

    const ip = request.headers.get('x-forwarded-for') || '';
    await SuperAdminAction.create({
      adminUserId: adminUser.userId,
      action: 'feature_flag.override',
      targetType: 'Tenant',
      targetId: String(tenant._id),
      description: `Set feature "${feature}" to ${enabled} for tenant ${tenantSlug}`,
      changes: { feature, enabled, reason, expiresAt },
      ipAddress: ip,
      userAgent: request.headers.get('user-agent') || '',
    });

    return NextResponse.json({ success: true, data: override });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    return handleApiError(error);
  }
}

// DELETE /api/super-admin/feature-flags/[tenantSlug]?feature=xxx
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> }
) {
  try {
    await connectDB();
    const adminUser = await requireRole(request, ['super_admin']);

    const { tenantSlug } = await params;
    const tenant = await resolveTenant(tenantSlug);
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const feature = new URL(request.url).searchParams.get('feature');
    if (!feature) {
      return NextResponse.json({ success: false, error: 'feature query param is required' }, { status: 400 });
    }

    await FeatureFlagOverride.deleteOne({ tenantId: tenant._id, feature });

    const ip = request.headers.get('x-forwarded-for') || '';
    await SuperAdminAction.create({
      adminUserId: adminUser.userId,
      action: 'feature_flag.remove',
      targetType: 'Tenant',
      targetId: String(tenant._id),
      description: `Removed feature flag override "${feature}" for tenant ${tenantSlug}`,
      ipAddress: ip,
      userAgent: request.headers.get('user-agent') || '',
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    return handleApiError(error);
  }
}
