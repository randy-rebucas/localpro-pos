import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getRepos, isDuplicateKeyError, type TenantInput } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getDefaultTenantSettings } from '@/lib/currency';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const { tenants: tenantRepo } = getRepos();

    // Check if admin credentials are provided; if so, return full info
    // Otherwise return limited public info for store selector (no auth required)
    let isAdmin = false;
    try {
      // Cross-tenant listing — super_admin only (not a per-tenant admin action)
      await requireRole(request, ['super_admin']);
      isAdmin = true;
    } catch {
      // Not authenticated — allow public read of active tenants
    }

    if (isAdmin) {
      const tenants = await tenantRepo.listActive({ select: 'slug name settings isActive createdAt' });
      return NextResponse.json({ success: true, data: tenants });
    }

    // Public store directory (web + mobile): enough to pick a tenant by category and name.
    // Omits full street address and theme colors; includes businessType for filtering and city/country for display.
    const businessTypeFilter = request.nextUrl.searchParams.get('businessType')?.trim();
    const tenants = await tenantRepo.listDirectory(
      { businessType: businessTypeFilter || undefined },
      {
        select:
          'slug name settings.companyName settings.logo settings.currency settings.language settings.businessType settings.address.city settings.address.country',
      }
    );
    return NextResponse.json({ success: true, data: tenants });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: 'Failed to fetch tenants' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenants: tenantRepo, users: userRepo } = getRepos();
    // Creating a brand-new tenant is a platform-level action — super_admin only
    await requireRole(request, ['super_admin']);

    const body = await request.json();
    const { slug, name, domain, subdomain, currency, language, email, phone, companyName } = body;

    if (!slug || !name) {
      return NextResponse.json(
        { success: false, error: 'Slug and name are required' },
        { status: 400 }
      );
    }

    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return NextResponse.json(
        { success: false, error: 'Slug can only contain lowercase letters, numbers, and hyphens' },
        { status: 400 }
      );
    }

    // Check if tenant already exists
    // Slug clash (any tenant), or domain/subdomain clash with an active tenant.
    // A clash with an inactive tenant's domain/subdomain is caught by the
    // unique index on create (DuplicateKeyError → 400 below).
    const existing =
      (await tenantRepo.findBySlug(slug.toLowerCase(), { select: '_id' })) ||
      (domain || subdomain
        ? await tenantRepo.findActiveByHost(subdomain ? subdomain.toLowerCase() : '', domain || '', { select: '_id' })
        : null);

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Tenant with this slug, domain, or subdomain already exists' },
        { status: 400 }
      );
    }

    // Get default settings and customize
    const defaultSettings = getDefaultTenantSettings();
    const settings = {
      ...defaultSettings,
      currency: currency || defaultSettings.currency,
      language: (language === 'es' ? 'es' : 'en') as 'en' | 'es',
      ...(email && { email }),
      ...(phone && { phone }),
      ...(companyName && { companyName }),
    };

    const tenantData: TenantInput = {
      slug: slug.toLowerCase(),
      name,
      settings,
      isActive: true,
    };

    if (domain) tenantData.domain = domain;
    if (subdomain) tenantData.subdomain = subdomain.toLowerCase();

    const tenant = await tenantRepo.create(tenantData);

    // Automatically create admin user for the tenant
    const adminEmail = `admin@${tenant.slug}.local`;
    const adminPassword = crypto.randomBytes(16).toString('base64url');
    
    try {
      const adminUser = await userRepo.create({
        email: adminEmail,
        password: adminPassword,
        name: 'Administrator',
        role: 'admin',
        tenantId: tenant._id,
        isActive: true,
      });

      await createAuditLog(request, {
        tenantId: tenant._id,
        action: AuditActions.CREATE,
        entityType: 'user',
        entityId: adminUser._id,
        changes: { email: adminUser.email, role: adminUser.role },
      });
    } catch (userError: unknown) {
      // Log error but don't fail tenant creation if user creation fails
      logger.error('Failed to create admin user:', (userError as Error).message);
    }

    await createAuditLog(request, {
      tenantId: tenant._id,
      action: AuditActions.CREATE,
      entityType: 'tenant',
      entityId: tenant._id,
      changes: { slug: tenant.slug, name: tenant.name },
    });

    return NextResponse.json({ 
      success: true, 
      data: tenant,
      adminUser: {
        email: adminEmail,
        password: adminPassword,
        note: 'Admin user created automatically. Please change the password after first login.'
      }
    }, { status: 201 });
  } catch (error: unknown) {
    if (isDuplicateKeyError(error)) {
      const field = duplicateField(error);
      return NextResponse.json(
        { success: false, error: `${field} already exists` },
        { status: 400 }
      );
    }
    if ((error as Error).message === 'Unauthorized' || (error as Error).message.includes('Forbidden')) {
      return NextResponse.json(
        { success: false, error: (error as Error).message },
        { status: (error as Error).message === 'Unauthorized' ? 401 : 403 }
      );
    }
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 400 });
  }
}

/** The field a duplicate-key error is about (Mongo's keyPattern, kept on DuplicateKeyError.cause). */
function duplicateField(error: unknown): string {
  const e = error as { keyPattern?: Record<string, unknown>; cause?: { keyPattern?: Record<string, unknown> } };
  return Object.keys(e.keyPattern ?? e.cause?.keyPattern ?? {})[0] ?? 'Field';
}
