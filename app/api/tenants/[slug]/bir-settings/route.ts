/**
 * BIR Settings API
 * GET/PUT BIR compliance data (TIN, PTU) for a tenant
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRepos, type TenantPath } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { handleApiError } from '@/lib/error-handler';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';
import { checkBirFeatureAccess } from '@/lib/subscription';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { slug } = await params;

    const tenant = await getRepos().tenants.findBySlug(slug, { activeOnly: true });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // Tenant isolation
    if (user.role !== 'super_admin' && user.tenantId !== tenant._id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      data: {
        birTin: tenant.settings?.birTin ?? '',
        birPtuNumber: tenant.settings?.birPtuNumber ?? '',
        birPtuIssuedDate: tenant.settings?.birPtuIssuedDate ?? null,
        birPtuExpiryDate: tenant.settings?.birPtuExpiryDate ?? null,
      },
    });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to fetch BIR settings');
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit: 20 writes per minute
    const rl = checkRateLimit(`bir-settings:${user.userId}`, 20, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const { slug } = await params;

    const tenant = await getRepos().tenants.findBySlug(slug, { select: '_id' });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // Tenant isolation
    if (user.role !== 'super_admin' && user.tenantId !== tenant._id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    if (!(await hasTenantPermission(user.role, tenant._id, 'bir_compliance.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    try {
      await checkBirFeatureAccess(tenant._id, 'ptuAssistance');
    } catch (featureError: unknown) {
      return NextResponse.json(
        { success: false, error: featureError instanceof Error ? featureError.message : 'Feature not available' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { birTin, birPtuNumber, birPtuIssuedDate, birPtuExpiryDate } = body;

    // Validate TIN format if provided
    if (birTin && !/^\d{3}-\d{3}-\d{3}-\d{3}$/.test(birTin)) {
      return NextResponse.json(
        { success: false, error: 'BIR TIN must be in format NNN-NNN-NNN-NNN' },
        { status: 400 }
      );
    }

    // Submitted fields only; an empty value clears the field
    const set: Partial<Record<TenantPath, unknown>> = {};
    const unset: TenantPath[] = [];
    const assign = (key: string, value: unknown) => {
      if (value === undefined) unset.push(`settings.${key}`);
      else set[`settings.${key}`] = value;
    };
    if (birTin !== undefined) assign('birTin', birTin || undefined);
    if (birPtuNumber !== undefined) assign('birPtuNumber', birPtuNumber || undefined);
    if (birPtuIssuedDate !== undefined) {
      assign('birPtuIssuedDate', birPtuIssuedDate ? new Date(birPtuIssuedDate) : undefined);
    }
    if (birPtuExpiryDate !== undefined) {
      assign('birPtuExpiryDate', birPtuExpiryDate ? new Date(birPtuExpiryDate) : undefined);
    }

    const updated = await getRepos().tenants.update(tenant._id, { set, unset });
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    await createAuditLog(request, {
      tenantId: tenant._id,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'bir_settings',
      entityId: tenant._id,
      changes: { birTin, birPtuNumber, birPtuIssuedDate, birPtuExpiryDate },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to update BIR settings');
  }
}
