import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';
import { applyBusinessTypeDefaults } from '@/lib/business-types';

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await connectDB();
    await requireRole(request, ['super_admin']);
    const { slug } = await params;

    const tenant = await Tenant.findOne({ slug }).lean();
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: tenant });
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

export async function PUT(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await connectDB();
    const user = await requireRole(request, ['super_admin']);
    const { slug } = await params;

    const oldTenant = await Tenant.findOne({ slug }).lean();
    if (!oldTenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const body = await request.json();
    const { name, domain, subdomain, isActive, settings } = body;

    const updateData: Record<string, unknown> = {};

    if (name !== undefined) {
      if (!name.trim()) {
        return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 });
      }
      updateData.name = name.trim();
    }
    if (domain !== undefined) updateData.domain = domain.trim() || null;
    if (subdomain !== undefined) updateData.subdomain = subdomain.trim().toLowerCase() || null;
    if (isActive !== undefined) updateData.isActive = isActive;

    if (settings !== undefined) {
      const currentBusinessType = oldTenant.settings?.businessType;
      const newBusinessType = settings.businessType;
      let mergedSettings = { ...oldTenant.settings, ...settings };
      if (newBusinessType && newBusinessType !== currentBusinessType) {
        mergedSettings = applyBusinessTypeDefaults(mergedSettings, newBusinessType);
      }
      updateData.settings = mergedSettings;
    }

    const tenant = await Tenant.findOneAndUpdate({ slug }, updateData, { new: true, runValidators: true });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const changes: Record<string, unknown> = {};
    Object.keys(updateData).forEach(key => {
      if (key !== 'settings') {
        changes[key] = { old: oldTenant[key as keyof typeof oldTenant], new: updateData[key] };
      }
    });
    if (settings) changes.settings = { updated: true };

    await createAuditLog(request, {
      tenantId: tenant._id,
      action: AuditActions.UPDATE,
      entityType: 'tenant',
      entityId: tenant._id.toString(),
      changes,
      metadata: { updatedBy: user.userId, role: 'super_admin' },
    });

    return NextResponse.json({ success: true, data: tenant });
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized' || error.message.includes('Forbidden')) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: error.message === 'Unauthorized' ? 401 : 403 }
        );
      }
      if ((error as NodeJS.ErrnoException).code === '11000') {
        return NextResponse.json({ success: false, error: 'Domain or subdomain already exists' }, { status: 400 });
      }
    }
    return handleApiError(error);
  }
}
