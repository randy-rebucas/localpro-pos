import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { applyBusinessTypeDefaults } from '@/lib/business-types';

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await connectDB();
    const { slug } = await params;
    const t = await getValidationTranslatorFromRequest(request);
    const tenant = await Tenant.findOne({ slug }).lean();

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
      !!user && (user.role === 'super_admin' || user.tenantId === tenant._id.toString());

    if (isSameTenantOrAdmin) {
      return NextResponse.json({ success: true, data: tenant });
    }

    return NextResponse.json({
      success: true,
      data: { _id: tenant._id, slug: tenant.slug, name: tenant.name },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await connectDB();
    const user = await requireAuth(request);
    const { slug } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    const body = await request.json();
    const { name, domain, subdomain, isActive, settings } = body;

    const oldTenant = await Tenant.findOne({ slug }).lean();
    if (!oldTenant) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== oldTenant._id.toString()) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    if (!(await hasTenantPermission(user.role, oldTenant._id.toString(), 'tenant_profile.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const updateData: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    // Only $set the individual keys this request actually owns — a full
    // `settings: mergedSettings` replace would clobber a concurrent write made
    // through /api/tenants/[slug]/settings (which itself only $sets its own
    // submitted keys) with this request's stale read of the rest of the doc.
    const setPayload: Record<string, unknown> = {};

    if (name !== undefined) {
      if (!name.trim()) {
        return NextResponse.json(
          { success: false, error: t('validation.nameRequired', 'Name is required') },
          { status: 400 }
        );
      }
      updateData.name = name.trim();
      setPayload.name = updateData.name;
    }

    if (domain !== undefined) {
      updateData.domain = domain.trim() || null;
      setPayload.domain = updateData.domain;
    }

    if (subdomain !== undefined) {
      updateData.subdomain = subdomain.trim().toLowerCase() || null;
      setPayload.subdomain = updateData.subdomain;
    }

    if (isActive !== undefined) {
      updateData.isActive = isActive;
      setPayload.isActive = updateData.isActive;
    }

    let settingsKeysToSet: string[] = [];
    if (settings !== undefined) {
      // Check if business type is being changed
      const currentBusinessType = oldTenant.settings?.businessType;
      const newBusinessType = settings.businessType;

      let updatedSettings = settings;
      settingsKeysToSet = Object.keys(settings);

      // Apply business type defaults if business type is being set or changed —
      // computed against a full merge (read-only, never written back wholesale)
      // so defaults resolve correctly, but only the resulting *changed* keys
      // are added to the per-key $set alongside the submitted ones.
      if (newBusinessType && newBusinessType !== currentBusinessType) {
        const mergedSettings = { ...oldTenant.settings, ...settings };
        const withDefaults = applyBusinessTypeDefaults(mergedSettings, newBusinessType);
        const defaultKeys = Object.keys(withDefaults).filter(
          (key) => JSON.stringify(withDefaults[key]) !== JSON.stringify(mergedSettings[key])
        );
        updatedSettings = withDefaults;
        settingsKeysToSet = Array.from(new Set([...settingsKeysToSet, ...defaultKeys]));
      }

      for (const key of settingsKeysToSet) {
        setPayload[`settings.${key}`] = updatedSettings[key];
      }
      updateData.settings = { ...oldTenant.settings, ...updatedSettings };
    }

    const tenant = await Tenant.findOneAndUpdate(
      { slug },
      { $set: setPayload },
      { new: true, runValidators: true }
    );
    
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // Track changes
    const changes: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
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
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const t = await getValidationTranslatorFromRequest(request);
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
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
    await connectDB();
    const user = await requireAuth(request);
    const { slug } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    const tenant = await Tenant.findOne({ slug }).lean();
    if (!tenant) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant._id.toString()) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    if (!(await hasTenantPermission(user.role, tenant._id.toString(), 'tenant_profile.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
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

