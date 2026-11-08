import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { applyBusinessTypeDefaults, isBusinessTypeOpenForSignup } from '@/lib/business-types';
import { stripSecretSettings } from '@/lib/tenant-settings-access';
import { parseCustomDomain, parseSubdomain, type HostInputResult } from '@/lib/tenant-host-input';
import { validateEmail } from '@/lib/validation';
import { checkRateLimit } from '@/lib/rate-limit';

type Translate = (key: string, fallback: string) => string;

/**
 * The only settings keys the tenant profile form may write through this route.
 * Everything else has its own endpoint with its own permission checks
 * (/settings, /role-permissions, /bir-settings, ...); accepting arbitrary keys
 * here would be a way around all of them.
 */
const PROFILE_SETTINGS_KEYS = new Set(['currency', 'language', 'email', 'phone', 'companyName', 'businessType']);
const LANGUAGES = new Set(['en', 'es']);

/** What a tenant's own profile managers may see: no secrets, no super-admin notes. */
function forTenantStaff<T extends { settings?: unknown; notes?: unknown }>(tenant: T) {
  const { notes: _notes, ...rest } = tenant;
  return { ...rest, settings: stripSecretSettings(tenant.settings) };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await connectDB();
    const { slug } = await params;
    const t = await getValidationTranslatorFromRequest(request);
    const tenant = await Tenant.findOne({ slug }).select('-dailyReport').lean();

    if (!tenant) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    // The tenant document (BIR/permit numbers, contact info, integration
    // settings, ...) is for a super_admin or the tenant's own profile managers.
    // Everyone else — other staff, other tenants, anonymous callers such as the
    // forbidden-access page — gets only the identity fields.
    let user;
    try {
      user = await requireAuth(request);
    } catch {
      user = null;
    }
    const tenantId = tenant._id.toString();

    if (user?.role === 'super_admin') {
      return NextResponse.json({ success: true, data: tenant });
    }

    if (user && user.tenantId === tenantId && (await hasTenantPermission(user.role, tenantId, 'tenant_profile.manage'))) {
      return NextResponse.json({ success: true, data: forTenantStaff(tenant) });
    }

    return NextResponse.json({
      success: true,
      data: { _id: tenant._id, slug: tenant.slug, name: tenant.name },
    });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}

function hostError(result: Extract<HostInputResult, { ok: false }>, t: Translate, field: 'domain' | 'subdomain') {
  if (result.code === 'reserved') return t('validation.subdomainReserved', 'That subdomain is reserved');
  if (result.code === 'platform') return t('validation.domainIsPlatform', 'That domain belongs to the platform');
  return field === 'domain'
    ? t('validation.invalidDomain', 'Enter a domain name like shop.example.com')
    : t('validation.invalidSubdomain', 'Use letters, numbers and hyphens only');
}

/** Validates the profile settings the form sends. Returns the clean values or an error message. */
function parseProfileSettings(settings: unknown, t: Translate): { ok: true; value: Record<string, string> } | { ok: false; error: string } {
  const invalid = t('validation.invalidValue', 'Invalid value');
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return { ok: false, error: invalid };

  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(settings as Record<string, unknown>)) {
    if (!PROFILE_SETTINGS_KEYS.has(key)) {
      return { ok: false, error: `${t('validation.settingNotEditableHere', 'This setting cannot be changed here')} (${key})` };
    }
    if (value === undefined) continue;
    if (typeof value !== 'string') return { ok: false, error: `${invalid} (${key})` };
    const text = value.trim();
    if (text.length > 200) return { ok: false, error: `${t('validation.valueTooLong', 'Value is too long')} (${key})` };

    if (key === 'currency') {
      if (!/^[A-Za-z]{3}$/.test(text)) return { ok: false, error: t('validation.invalidCurrencyCode', 'Invalid currency code') };
      clean.currency = text.toUpperCase();
    } else if (key === 'language') {
      if (!LANGUAGES.has(text)) return { ok: false, error: t('validation.invalidLanguage', 'Invalid language') };
      clean.language = text;
    } else if (key === 'email') {
      if (text && !validateEmail(text)) return { ok: false, error: t('validation.invalidEmailFormat', 'Invalid email format') };
      clean.email = text.toLowerCase();
    } else if (key === 'businessType') {
      if (!text) return { ok: false, error: t('validation.businessTypeRequired', 'Choose a business type') };
      clean.businessType = text;
    } else {
      clean[key] = text; // phone, companyName — '' clears
    }
  }
  return { ok: true, value: clean };
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await connectDB();
    const user = await requireAuth(request);
    const { slug } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    const body = await request.json();
    const { name, domain, subdomain, isActive, settings } = body ?? {};

    const oldTenant = await Tenant.findOne({ slug }).lean();
    if (!oldTenant) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }
    const tenantId = oldTenant._id.toString();

    if (user.role !== 'super_admin' && user.tenantId !== tenantId) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    if (!(await hasTenantPermission(user.role, tenantId, 'tenant_profile.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const { allowed } = checkRateLimit(`write:tenant-profile:${tenantId}:${user.userId}`, 20, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    // Suspending or reactivating a whole store is a platform decision.
    if (isActive !== undefined && user.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: 'Forbidden: Only the platform can change store status' }, { status: 403 });
    }

    const badRequest = (error: string) => NextResponse.json({ success: false, error }, { status: 400 });

    const updateData: Record<string, unknown> = {};
    // Only $set the individual keys this request actually owns — a full
    // `settings: mergedSettings` replace would clobber a concurrent write made
    // through /api/tenants/[slug]/settings (which itself only $sets its own
    // submitted keys) with this request's stale read of the rest of the doc.
    const setPayload: Record<string, unknown> = {};
    const unsetPayload: Record<string, ''> = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return badRequest(t('validation.nameRequired', 'Name is required'));
      }
      if (name.trim().length > 120) return badRequest(t('validation.valueTooLong', 'Value is too long'));
      updateData.name = name.trim();
      setPayload.name = updateData.name;
    }

    // domain/subdomain decide which store a request host resolves to, so they
    // are validated (no platform hosts, no reserved names); empty unsets them.
    for (const [field, raw, parse] of [
      ['domain', domain, parseCustomDomain],
      ['subdomain', subdomain, parseSubdomain],
    ] as const) {
      if (raw === undefined) continue;
      const parsed = parse(raw);
      if (!parsed.ok) return badRequest(hostError(parsed, t, field));
      updateData[field] = parsed.value;
      if (parsed.value === null) unsetPayload[field] = '';
      else setPayload[field] = parsed.value;
    }

    if (isActive !== undefined) {
      if (typeof isActive !== 'boolean') return badRequest(t('validation.invalidValue', 'Invalid value'));
      updateData.isActive = isActive;
      setPayload.isActive = isActive;
    }

    let settingsKeysToSet: string[] = [];
    if (settings !== undefined) {
      const parsed = parseProfileSettings(settings, t);
      if (!parsed.ok) return badRequest(parsed.error);
      const clean = parsed.value;

      const currentBusinessType = oldTenant.settings?.businessType;
      const newBusinessType = clean.businessType;

      // A tenant may stay on a closed type, but cannot move onto one
      if (newBusinessType && newBusinessType !== currentBusinessType && !isBusinessTypeOpenForSignup(newBusinessType)) {
        return badRequest(t('validation.businessTypeUnavailable', 'This business type is no longer available'));
      }

      let updatedSettings: Record<string, unknown> = clean;
      settingsKeysToSet = Object.keys(clean);

      // Apply business type defaults if business type is being set or changed —
      // computed against a full merge (read-only, never written back wholesale)
      // so defaults resolve correctly, but only the resulting *changed* keys
      // are added to the per-key $set alongside the submitted ones.
      if (newBusinessType && newBusinessType !== currentBusinessType) {
        const mergedSettings = { ...oldTenant.settings, ...clean } as Record<string, unknown>;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const withDefaults = applyBusinessTypeDefaults(mergedSettings as any, newBusinessType) as Record<string, unknown>;
        const defaultKeys = Object.keys(withDefaults).filter(
          (key) => JSON.stringify(withDefaults[key]) !== JSON.stringify(mergedSettings[key])
        );
        updatedSettings = withDefaults;
        settingsKeysToSet = Array.from(new Set([...settingsKeysToSet, ...defaultKeys]));
      }

      for (const key of settingsKeysToSet) {
        setPayload[`settings.${key}`] = updatedSettings[key];
      }
    }

    if (Object.keys(setPayload).length === 0 && Object.keys(unsetPayload).length === 0) {
      return badRequest(t('validation.noChanges', 'No changes provided'));
    }

    const update: Record<string, unknown> = {};
    if (Object.keys(setPayload).length) update.$set = setPayload;
    if (Object.keys(unsetPayload).length) update.$unset = unsetPayload;

    const tenant = await Tenant.findOneAndUpdate({ slug }, update, { new: true, runValidators: true }).lean();

    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // Track changes
    const changes: Record<string, unknown> = {};
    Object.keys(updateData).forEach(key => {
      const oldValue = (oldTenant as Record<string, unknown>)[key] ?? null;
      if (oldValue !== updateData[key]) {
        changes[key] = { old: oldValue, new: updateData[key] };
      }
    });
    if (settingsKeysToSet.length) {
      changes.settings = { keys: settingsKeysToSet };
    }

    await createAuditLog(request, {
      tenantId: tenant._id,
      action: AuditActions.UPDATE,
      entityType: 'tenant',
      entityId: tenantId,
      changes,
    });

    return NextResponse.json({ success: true, data: user.role === 'super_admin' ? tenant : forTenantStaff(tenant) });
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
    if (error.message === 'Unauthorized' || error.message?.includes('Forbidden')) {
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

    // Closing a whole store (every lookup needs isActive) is a platform action;
    // tenant staff, owners included, go through support.
    if (user.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: 'Forbidden: Only the platform can close a store' }, { status: 403 });
    }

    const tenant = await Tenant.findOne({ slug }).lean();
    if (!tenant) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
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
    if (error.message === 'Unauthorized' || error.message?.includes('Forbidden')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    return handleApiError(error);
  }
}
