import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkFeatureAccess } from '@/lib/subscription';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';

function configToApi(config: {
  id: string;
  tenantId: string;
  pointsPerPeso: unknown;
  pesoPerPoint: unknown;
  minRedemption: number;
  isEnabled: boolean;
}) {
  return {
    _id: config.id,
    tenantId: config.tenantId,
    pointsPerPeso: Number(config.pointsPerPeso),
    pesoPerPoint: Number(config.pesoPerPoint),
    minRedemption: config.minRedemption,
    isEnabled: config.isEnabled,
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    // All authenticated roles can read loyalty config (e.g. cashiers need it to apply redemptions).
    // Mutations are restricted to owner|admin in the PUT handler below.

    const tenantId = await getTenantIdFromRequest(request);
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    try {
      await checkFeatureAccess(tenantId.toString(), 'enableLoyaltyProgram');
    } catch (featureError: unknown) {
      return NextResponse.json(
        { success: false, error: (featureError as Error).message },
        { status: 403 }
      );
    }

    const config = await prisma.loyaltyConfig.findUnique({ where: { tenantId } });

    // Return defaults if not yet configured
    if (!config) {
      return NextResponse.json({
        success: true,
        data: {
          tenantId,
          pointsPerPeso: 1,
          pesoPerPoint: 0.10,
          minRedemption: 100,
          isEnabled: true,
        },
      });
    }

    return NextResponse.json({ success: true, data: configToApi(config) });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch loyalty config');
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = await getTenantIdFromRequest(request);
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (!(await hasTenantPermission(user.role, tenantId, 'loyalty.config'))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    try {
      await checkFeatureAccess(tenantId.toString(), 'enableLoyaltyProgram');
    } catch (featureError: unknown) {
      return NextResponse.json(
        { success: false, error: (featureError as Error).message },
        { status: 403 }
      );
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:loyalty-config:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const body = await request.json();
    const { pointsPerPeso, pesoPerPoint, minRedemption, isEnabled } = body;

    if (pointsPerPeso !== undefined && (typeof pointsPerPeso !== 'number' || pointsPerPeso <= 0)) {
      return NextResponse.json({ success: false, error: 'pointsPerPeso must be a positive number' }, { status: 400 });
    }
    if (pesoPerPoint !== undefined && (typeof pesoPerPoint !== 'number' || pesoPerPoint <= 0)) {
      return NextResponse.json({ success: false, error: 'pesoPerPoint must be a positive number' }, { status: 400 });
    }
    if (minRedemption !== undefined && (typeof minRedemption !== 'number' || minRedemption < 1)) {
      return NextResponse.json({ success: false, error: 'minRedemption must be at least 1' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (pointsPerPeso !== undefined) updates.pointsPerPeso = pointsPerPeso;
    if (pesoPerPoint !== undefined) updates.pesoPerPoint = pesoPerPoint;
    if (minRedemption !== undefined) updates.minRedemption = minRedemption;
    if (isEnabled !== undefined) updates.isEnabled = isEnabled;

    const config = await prisma.loyaltyConfig.upsert({
      where: { tenantId },
      create: { tenantId, ...updates },
      update: updates,
    });

    await createAuditLog(request, {
      tenantId: tenantId.toString(),
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'loyalty_config',
      entityId: config.id,
      changes: updates,
    });

    return NextResponse.json({ success: true, data: configToApi(config) });
  } catch (error) {
    return handleApiError(error, 'Failed to update loyalty config');
  }
}
