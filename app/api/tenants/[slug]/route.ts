import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await connectDB();
    const { slug } = await params;
    const tenant = await Tenant.findOne({ slug }).lean();
    
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }
    
    return NextResponse.json({ success: true, data: tenant });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await connectDB();
    await requireRole(request, ['admin']);
    const { slug } = await params;
    
    const body = await request.json();
    const { name, domain, subdomain, isActive, settings } = body;

    const oldTenant = await Tenant.findOne({ slug }).lean();
    if (!oldTenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const updateData: any = {};
    
    if (name !== undefined) {
      if (!name.trim()) {
        return NextResponse.json(
          { success: false, error: 'Name is required' },
          { status: 400 }
        );
      }
      updateData.name = name.trim();
    }
    
    if (domain !== undefined) {
      updateData.domain = domain.trim() || null;
    }
    
    if (subdomain !== undefined) {
      updateData.subdomain = subdomain.trim().toLowerCase() || null;
    }
    
    if (isActive !== undefined) {
      updateData.isActive = isActive;
    }
    
    if (settings !== undefined) {
      updateData.settings = { ...oldTenant.settings, ...settings };
    }

    const tenant = await Tenant.findOneAndUpdate(
      { slug },
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // Track changes
    const changes: Record<string, any> = {};
    Object.keys(updateData).forEach(key => {
      if (key !== 'settings' && oldTenant[key as keyof typeof oldTenant] !== updateData[key]) {
        changes[key] = {
          old: oldTenant[key as keyof typeof oldTenant],
          new: updateData[key],
        };
      }
    });
    if (settings) {
      changes.settings = { updated: true };
    }

    await createAuditLog(request, {
      tenantId: tenant._id,
      action: AuditActions.UPDATE,
      entityType: 'tenant',
      entityId: tenant._id.toString(),
      changes,
    });
    
    return NextResponse.json({ success: true, data: tenant });
  } catch (error: any) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return NextResponse.json(
        { success: false, error: `${field} already exists` },
        { status: 400 }
      );
    }
    if (error.message === 'Unauthorized' || error.message.includes('Forbidden')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await connectDB();
    await requireRole(request, ['admin']);
    const { slug } = await params;
    
    const tenant = await Tenant.findOne({ slug }).lean();
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // Soft delete - set isActive to false
    await Tenant.findOneAndUpdate({ slug }, { isActive: false });

    await createAuditLog(request, {
      tenantId: tenant._id,
      action: AuditActions.DELETE,
      entityType: 'tenant',
      entityId: tenant._id.toString(),
      changes: { slug: tenant.slug, name: tenant.name },
    });
    
    return NextResponse.json({ success: true, data: {} });
  } catch (error: any) {
    if (error.message === 'Unauthorized' || error.message.includes('Forbidden')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    return handleApiError(error);
  }
}

