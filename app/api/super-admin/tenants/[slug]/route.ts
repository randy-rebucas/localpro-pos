import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';
import { applyBusinessTypeDefaults } from '@/lib/business-types';
import { getTenantBySlugAny } from '@/lib/data/tenants';

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await requireRole(request, ['super_admin']);
    const { slug } = await params;

    const tenant = await getTenantBySlugAny(slug);
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { ...tenant, _id: tenant.id } });
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
    const user = await requireRole(request, ['super_admin']);
    const { slug } = await params;

    const oldTenant = await getTenantBySlugAny(slug);
    if (!oldTenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const body = await request.json();
    const { name, domain, subdomain, isActive, settings, onboardingStatus, notes } = body;

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
    if (onboardingStatus !== undefined) updateData.onboardingStatus = onboardingStatus;
    if (notes !== undefined) updateData.notes = notes;

    if (settings !== undefined) {
      const oldSettings = (oldTenant.settings as Record<string, unknown>) || {};
      const currentBusinessType = oldSettings.businessType;
      const newBusinessType = settings.businessType;
      let mergedSettings = { ...oldSettings, ...settings };
      if (newBusinessType && newBusinessType !== currentBusinessType) {
        mergedSettings = applyBusinessTypeDefaults(mergedSettings, newBusinessType);
      }
      updateData.settings = mergedSettings;
    }

    let tenant;
    try {
      tenant = await prisma.tenant.update({ where: { slug }, data: updateData });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
        return NextResponse.json({ success: false, error: 'Domain or subdomain already exists' }, { status: 400 });
      }
      throw err;
    }
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const changes: Record<string, unknown> = {};
    Object.keys(updateData).forEach(key => {
      if (key !== 'settings') {
        changes[key] = { old: (oldTenant as Record<string, unknown>)[key], new: updateData[key] };
      }
    });
    if (settings) changes.settings = { updated: true };

    await createAuditLog(request, {
      tenantId: tenant.id,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'tenant',
      entityId: tenant.id,
      changes,
      metadata: { updatedBy: user.userId, role: 'super_admin' },
    });

    return NextResponse.json({ success: true, data: { ...tenant, _id: tenant.id } });
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized' || error.message.includes('Forbidden')) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: error.message === 'Unauthorized' ? 401 : 403 }
        );
      }
    }
    return handleApiError(error);
  }
}
