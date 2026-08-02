import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { applyBusinessTypeDefaults } from '@/lib/business-types';
import { getTenantBySlugAny } from '@/lib/data/tenants';
import { Prisma } from '@prisma/client';

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const t = await getValidationTranslatorFromRequest(request);
    const tenant = await getTenantBySlugAny(slug);

    if (!tenant) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { _id: tenant.id, ...tenant } });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const user = await requireAuth(request);
    const { slug } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    const body = await request.json();
    const { name, domain, subdomain, isActive, settings } = body;

    const oldTenant = await getTenantBySlugAny(slug);
    if (!oldTenant) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== oldTenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    if (!(await hasTenantPermission(user.role, oldTenant.id, 'tenant_profile.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const updateData: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any

    if (name !== undefined) {
      if (!name.trim()) {
        return NextResponse.json(
          { success: false, error: t('validation.nameRequired', 'Name is required') },
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
      // Check if business type is being changed
      const currentBusinessType = (oldTenant.settings as Record<string, unknown> | null)?.businessType;
      const newBusinessType = settings.businessType;

      // Merge settings first
      let mergedSettings = { ...(oldTenant.settings as Record<string, unknown>), ...settings };

      // Apply business type defaults if business type is being set or changed
      if (newBusinessType && newBusinessType !== currentBusinessType) {
        mergedSettings = applyBusinessTypeDefaults(mergedSettings, newBusinessType);
      }

      updateData.settings = mergedSettings;
    }

    let tenant;
    try {
      tenant = await prisma.tenant.update({ where: { id: oldTenant.id }, data: updateData });
    } catch (updateErr: unknown) {
      if (updateErr instanceof Prisma.PrismaClientKnownRequestError && updateErr.code === 'P2025') {
        return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
      }
      throw updateErr;
    }

    // Track changes
    const changes: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    Object.keys(updateData).forEach(key => {
      if (key !== 'settings' && (oldTenant as any)[key] !== (updateData as any)[key]) { // eslint-disable-line @typescript-eslint/no-explicit-any
        changes[key] = {
          old: (oldTenant as any)[key], // eslint-disable-line @typescript-eslint/no-explicit-any
          new: (updateData as any)[key], // eslint-disable-line @typescript-eslint/no-explicit-any
        };
      }
    });
    if (settings) {
      changes.settings = { updated: true };
    }

    await createAuditLog(request, {
      tenantId: tenant.id,
      action: AuditActions.UPDATE,
      entityType: 'tenant',
      entityId: tenant.id,
      changes,
    });

    return NextResponse.json({ success: true, data: { _id: tenant.id, ...tenant } });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const t = await getValidationTranslatorFromRequest(request);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const field = (error.meta?.target as string[] | undefined)?.[0] || 'field';
      const errorMsg = t('validation.fieldAlreadyExists', '{field} already exists').replace('{field}', field);
      return NextResponse.json(
        { success: false, error: errorMsg },
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
    const user = await requireAuth(request);
    const { slug } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    const tenant = await getTenantBySlugAny(slug);
    if (!tenant) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    if (!(await hasTenantPermission(user.role, tenant.id, 'tenant_profile.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    // Soft delete - set isActive to false
    await prisma.tenant.update({ where: { id: tenant.id }, data: { isActive: false } });

    await createAuditLog(request, {
      tenantId: tenant.id,
      action: AuditActions.DELETE,
      entityType: 'tenant',
      entityId: tenant.id,
      changes: { slug: tenant.slug, name: tenant.name },
    });

    return NextResponse.json({ success: true, data: {} });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (error.message === 'Unauthorized' || error.message.includes('Forbidden')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    return handleApiError(error);
  }
}
