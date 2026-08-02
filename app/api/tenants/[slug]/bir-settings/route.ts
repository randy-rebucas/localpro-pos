/**
 * BIR Settings API
 * GET/PUT BIR compliance data (TIN, PTU) for a tenant
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { handleApiError } from '@/lib/error-handler';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';
import { getTenantBySlug, getTenantBySlugAny } from '@/lib/data/tenants';

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

    const tenant = await getTenantBySlug(slug);
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // Tenant isolation
    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const settings = (tenant.settings as Record<string, unknown>) || {};

    return NextResponse.json({
      success: true,
      data: {
        birTin: settings.birTin ?? '',
        birPtuNumber: settings.birPtuNumber ?? '',
        birPtuIssuedDate: settings.birPtuIssuedDate ?? null,
        birPtuExpiryDate: settings.birPtuExpiryDate ?? null,
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

    const tenant = await getTenantBySlugAny(slug);
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // Tenant isolation
    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    if (!(await hasTenantPermission(user.role, tenant.id, 'bir_compliance.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
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

    const settings = { ...(tenant.settings as Record<string, unknown>) };
    if (birTin !== undefined) settings.birTin = birTin || undefined;
    if (birPtuNumber !== undefined) settings.birPtuNumber = birPtuNumber || undefined;
    if (birPtuIssuedDate !== undefined) {
      settings.birPtuIssuedDate = birPtuIssuedDate ? new Date(birPtuIssuedDate).toISOString() : undefined;
    }
    if (birPtuExpiryDate !== undefined) {
      settings.birPtuExpiryDate = birPtuExpiryDate ? new Date(birPtuExpiryDate).toISOString() : undefined;
    }

    await prisma.tenant.update({ where: { id: tenant.id }, data: { settings: settings as Prisma.InputJsonValue } });

    await createAuditLog(request, {
      tenantId: tenant.id,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'bir_settings',
      entityId: tenant.id,
      changes: { birTin, birPtuNumber, birPtuIssuedDate, birPtuExpiryDate },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to update BIR settings');
  }
}
