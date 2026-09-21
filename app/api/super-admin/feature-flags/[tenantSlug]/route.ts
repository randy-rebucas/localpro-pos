import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma, { dbTransaction } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';

async function resolveTenant(slug: string) {
  return prisma.tenant.findUnique({ where: { slug }, select: { id: true, slug: true, name: true } });
}

// GET /api/super-admin/feature-flags/[tenantSlug]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> }
) {
  try {
    await requireRole(request, ['super_admin']);

    const { tenantSlug } = await params;
    const tenant = await resolveTenant(tenantSlug);
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const overrides = await prisma.featureFlagOverride.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: 'desc' },
    });

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

    const ip = request.headers.get('x-forwarded-for') || '';
    const override = await dbTransaction(async (tx) => {
      const upserted = await tx.featureFlagOverride.upsert({
        where: { tenantId_feature: { tenantId: tenant.id, feature } },
        create: {
          id: randomUUID(),
          tenantId: tenant.id,
          feature,
          enabled,
          reason: reason || undefined,
          expiresAt: expiresAt ? new Date(expiresAt) : undefined,
          grantedById: adminUser.userId,
        },
        update: {
          enabled,
          reason: reason || undefined,
          expiresAt: expiresAt ? new Date(expiresAt) : undefined,
          grantedById: adminUser.userId,
        },
      });

      await tx.superAdminAction.create({
        data: {
          id: randomUUID(),
          adminUserId: adminUser.userId,
          action: 'feature_flag.override',
          targetType: 'Tenant',
          targetId: String(tenant.id),
          description: `Set feature "${feature}" to ${enabled} for tenant ${tenantSlug}`,
          changes: { feature, enabled, reason, expiresAt },
          ipAddress: ip,
          userAgent: request.headers.get('user-agent') || '',
        },
      });

      return upserted;
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

    const ip = request.headers.get('x-forwarded-for') || '';
    await dbTransaction(async (tx) => {
      await tx.featureFlagOverride.deleteMany({ where: { tenantId: tenant.id, feature } });
      await tx.superAdminAction.create({
        data: {
          id: randomUUID(),
          adminUserId: adminUser.userId,
          action: 'feature_flag.remove',
          targetType: 'Tenant',
          targetId: String(tenant.id),
          description: `Removed feature flag override "${feature}" for tenant ${tenantSlug}`,
          ipAddress: ip,
          userAgent: request.headers.get('user-agent') || '',
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    return handleApiError(error);
  }
}
