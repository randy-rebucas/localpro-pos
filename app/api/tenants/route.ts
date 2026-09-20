import { NextRequest, NextResponse } from 'next/server';
import crypto, { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import prisma, { dbTransaction } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getDefaultTenantSettings } from '@/lib/currency';
import { logger } from '@/lib/logger';
import { TENANT_IS_ACTIVE_FILTER } from '@/lib/tenant-active-query';

export async function GET(request: NextRequest) {
  try {
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
      const tenants = await prisma.tenant.findMany({
        where: TENANT_IS_ACTIVE_FILTER,
        select: { id: true, slug: true, name: true, isActive: true, createdAt: true, settings: true },
      });
      return NextResponse.json({ success: true, data: tenants });
    }

    // Public store directory (web + mobile): enough to pick a tenant by category and name.
    // Omits full street address and theme colors; includes businessType for filtering and city/country for display.
    const businessTypeFilter = request.nextUrl.searchParams.get('businessType')?.trim();
    const where: Record<string, unknown> = { ...TENANT_IS_ACTIVE_FILTER };
    if (businessTypeFilter) {
      where.settings = { is: { businessType: { equals: businessTypeFilter, mode: 'insensitive' } } };
    }

    const tenants = await prisma.tenant.findMany({
      where,
      select: {
        id: true,
        slug: true,
        name: true,
        settings: {
          select: {
            companyName: true,
            logo: true,
            currency: true,
            language: true,
            businessType: true,
            addressCity: true,
            addressCountry: true,
          },
        },
      },
    });
    return NextResponse.json({ success: true, data: tenants });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: 'Failed to fetch tenants' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
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
    const existing = await prisma.tenant.findFirst({
      where: {
        OR: [
          { slug: slug.toLowerCase() },
          ...(domain ? [{ domain }] : []),
          ...(subdomain ? [{ subdomain: subdomain.toLowerCase() }] : []),
        ],
      },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Tenant with this slug, domain, or subdomain already exists' },
        { status: 400 }
      );
    }

    // Get default settings and customize
    const defaultSettings = getDefaultTenantSettings();
    const settingsData: Record<string, unknown> = {
      currency: currency || defaultSettings.currency,
      language: (language === 'es' ? 'es' : 'en') as 'en' | 'es',
      ...(email && { email }),
      ...(phone && { phone }),
      ...(companyName && { companyName }),
    };

    const { tenant, adminUser, adminPassword } = await dbTransaction(async (tx) => {
      const newTenant = await tx.tenant.create({
        data: {
          id: randomUUID(),
          slug: slug.toLowerCase(),
          name,
          isActive: true,
          domain: domain || undefined,
          subdomain: subdomain ? subdomain.toLowerCase() : undefined,
          settings: { create: settingsData },
        },
      });

      // Automatically create admin user for the tenant
      const adminEmail = `admin@${newTenant.slug}.local`;
      const generatedPassword = crypto.randomBytes(16).toString('base64url');

      let createdAdminUser = null;
      try {
        const hashedPassword = await bcrypt.hash(generatedPassword, 10);
        createdAdminUser = await tx.user.create({
          data: {
            id: randomUUID(),
            email: adminEmail,
            password: hashedPassword,
            name: 'Administrator',
            role: 'admin',
            tenantId: newTenant.id,
            isActive: true,
          },
        });
      } catch (userError: unknown) {
        // Log error but don't fail tenant creation if user creation fails
        logger.error('Failed to create admin user:', (userError as Error).message);
      }

      return {
        tenant: newTenant,
        adminUser: createdAdminUser ? { email: adminEmail, id: createdAdminUser.id } : null,
        adminPassword: createdAdminUser ? generatedPassword : null,
      };
    });

    if (adminUser) {
      await createAuditLog(request, {
        tenantId: tenant.id,
        action: AuditActions.CREATE,
        entityType: 'user',
        entityId: adminUser.id,
        changes: { email: adminUser.email, role: 'admin' },
      });
    }

    await createAuditLog(request, {
      tenantId: tenant.id,
      action: AuditActions.CREATE,
      entityType: 'tenant',
      entityId: tenant.id,
      changes: { slug: tenant.slug, name: tenant.name },
    });

    return NextResponse.json({
      success: true,
      data: tenant,
      adminUser: adminUser ? {
        email: adminUser.email,
        password: adminPassword,
        note: 'Admin user created automatically. Please change the password after first login.'
      } : undefined,
    }, { status: 201 });
  } catch (error: unknown) {
    if ((error as Record<string, unknown>).code === 'P2002') {
      const meta = (error as { meta?: { target?: string[] } }).meta;
      const field = meta?.target?.[0] || 'field';
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
