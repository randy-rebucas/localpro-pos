/**
 * BIR Settings API
 * GET/PUT BIR compliance data (TIN, PTU) for a tenant
 */

import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { getCurrentUser } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';

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
    await connectDB();

    const tenant = await Tenant.findOne({ slug, isActive: true }).lean();
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // Tenant isolation
    if (user.role !== 'super_admin' && user.tenantId !== tenant._id.toString()) {
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

    if (user.role !== 'admin' && user.role !== 'owner' && user.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Rate limit: 20 writes per minute
    const rl = checkRateLimit(`bir-settings:${user.userId}`, 20, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const { slug } = await params;
    await connectDB();

    const tenant = await Tenant.findOne({ slug });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // Tenant isolation
    if (user.role !== 'super_admin' && user.tenantId !== tenant._id.toString()) {
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

    if (birTin !== undefined) tenant.settings.birTin = birTin || undefined;
    if (birPtuNumber !== undefined) tenant.settings.birPtuNumber = birPtuNumber || undefined;
    if (birPtuIssuedDate !== undefined) {
      tenant.settings.birPtuIssuedDate = birPtuIssuedDate ? new Date(birPtuIssuedDate) : undefined;
    }
    if (birPtuExpiryDate !== undefined) {
      tenant.settings.birPtuExpiryDate = birPtuExpiryDate ? new Date(birPtuExpiryDate) : undefined;
    }

    tenant.markModified('settings');
    await tenant.save();

    await createAuditLog(request, {
      tenantId: tenant._id,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'bir_settings',
      entityId: tenant._id.toString(),
      changes: { birTin, birPtuNumber, birPtuIssuedDate, birPtuExpiryDate },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to update BIR settings');
  }
}
