import { NextRequest, NextResponse } from 'next/server';
import prisma, { dbTransaction } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { applyBusinessTypeDefaults } from '@/lib/business-types';
import { flattenSettingsForPrisma } from '@/lib/tenant-settings-flatten';

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const t = await getValidationTranslatorFromRequest(request);
    const tenant = await prisma.tenant.findFirst({ where: { slug }, include: { settings: true } });

    if (!tenant) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    // Full tenant document (BIR/permit/registration numbers, contact info,
    // integration settings, etc.) is only for the tenant's own users or a
    // super_admin — everyone else (including unauthenticated callers, e.g.
    // the forbidden-access page identifying a tenant it was denied access to)
    // gets back only the minimal, non-sensitive identity fields.
    let user;
    try {
      user = await requireAuth(request);
    } catch {
      user = null;
    }
    const isSameTenantOrAdmin =
      !!user && (user.role === 'super_admin' || user.tenantId === tenant.id);

    if (isSameTenantOrAdmin) {
      return NextResponse.json({ success: true, data: tenant });
    }

    return NextResponse.json({
      success: true,
      data: { _id: tenant.id, slug: tenant.slug, name: tenant.name },
    });
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

    const oldTenant = await prisma.tenant.findFirst({ where: { slug }, include: { settings: true } });
    if (!oldTenant) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== oldTenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    if (!(await hasTenantPermission(user.role, oldTenant.id, 'tenant_profile.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};

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

    let settingsUpdate: Record<string, unknown> | undefined;
    if (settings !== undefined) {
      // Check if business type is being changed
      const currentBusinessType = oldTenant.settings?.businessType ?? undefined;
      const newBusinessType = settings.businessType;

      let updatedSettings = settings;

      // Apply business type defaults if business type is being set or changed —
      // computed against a full merge (read-only, never written back wholesale)
      // so defaults resolve correctly, but only the resulting *changed* keys
      // are applied alongside the submitted ones.
      if (newBusinessType && newBusinessType !== currentBusinessType) {
        const mergedSettings = { ...(oldTenant.settings ?? {}), ...settings };
        const withDefaults = applyBusinessTypeDefaults(mergedSettings, newBusinessType);
        updatedSettings = withDefaults;
      }

      settingsUpdate = flattenSettingsForPrisma(updatedSettings);
    }

    const tenant = await dbTransaction(async (tx) => {
      const updated = await tx.tenant.update({
        where: { id: oldTenant.id },
        data: updateData,
      });

      if (settingsUpdate) {
        await tx.tenantSettings.upsert({
          where: { tenantId: oldTenant.id },
          create: { tenantId: oldTenant.id, ...settingsUpdate },
          update: settingsUpdate,
        });
      }

      return tx.tenant.findUnique({ where: { id: updated.id }, include: { settings: true } });
    });

    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // Track changes
    const changes: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    Object.keys(updateData).forEach(key => {
      if (oldTenant[key as keyof typeof oldTenant] !== updateData[key]) {
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
      tenantId: tenant.id,
      action: AuditActions.UPDATE,
      entityType: 'tenant',
      entityId: tenant.id,
      changes,
    });

    return NextResponse.json({ success: true, data: tenant });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const t = await getValidationTranslatorFromRequest(request);
    if (error.code === 'P2002') {
      const field = error.meta?.target?.[0] || 'field';
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

    const tenant = await prisma.tenant.findFirst({ where: { slug } });
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
