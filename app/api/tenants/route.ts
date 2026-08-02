import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getDefaultTenantSettings } from '@/lib/currency';
import { createUser } from '@/lib/data/users';
import { logger } from '@/lib/logger';
import { Prisma } from '@prisma/client';

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
        where: { isActive: { not: false } },
        select: { id: true, slug: true, name: true, settings: true, isActive: true, createdAt: true },
      });
      return NextResponse.json({
        success: true,
        data: tenants.map(({ id, ...rest }) => ({ _id: id, ...rest })),
      });
    }

    // Public store directory (web + mobile): enough to pick a tenant by category and name.
    // Omits full street address and theme colors; includes businessType for filtering and city/country for display.
    const businessTypeFilter = request.nextUrl.searchParams.get('businessType')?.trim();

    const where: Prisma.TenantWhereInput = { isActive: { not: false } };
    const tenants = await prisma.tenant.findMany({
      where,
      select: { id: true, slug: true, name: true, settings: true },
    });

    // businessType / companyName / logo / currency / language / address live inside
    // the settings jsonb blob — filter and project in application code.
    const filtered = businessTypeFilter
      ? tenants.filter((t) => {
          const s = t.settings as Record<string, unknown> | null;
          const bt = s?.businessType;
          return typeof bt === 'string' && bt.toLowerCase() === businessTypeFilter.toLowerCase();
        })
      : tenants;

    const data = filtered.map((t) => {
      const s = (t.settings as Record<string, any>) || {}; // eslint-disable-line @typescript-eslint/no-explicit-any
      return {
        _id: t.id,
        slug: t.slug,
        name: t.name,
        settings: {
          companyName: s.companyName,
          logo: s.logo,
          currency: s.currency,
          language: s.language,
          businessType: s.businessType,
          address: { city: s.address?.city, country: s.address?.country },
        },
      };
    });

    return NextResponse.json({ success: true, data });
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
    const settings = {
      ...defaultSettings,
      currency: currency || defaultSettings.currency,
      language: (language === 'es' ? 'es' : 'en') as 'en' | 'es',
      ...(email && { email }),
      ...(phone && { phone }),
      ...(companyName && { companyName }),
    };

    let tenant;
    try {
      tenant = await prisma.tenant.create({
        data: {
          slug: slug.toLowerCase(),
          name,
          settings,
          isActive: true,
          domain: domain || undefined,
          subdomain: subdomain ? subdomain.toLowerCase() : undefined,
        },
      });
    } catch (createErr: unknown) {
      if (createErr instanceof Prisma.PrismaClientKnownRequestError && createErr.code === 'P2002') {
        const field = (createErr.meta?.target as string[] | undefined)?.[0] || 'field';
        return NextResponse.json(
          { success: false, error: `${field} already exists` },
          { status: 400 }
        );
      }
      throw createErr;
    }

    // Automatically create admin user for the tenant
    const adminEmail = `admin@${tenant.slug}.local`;
    const adminPassword = crypto.randomBytes(16).toString('base64url');

    try {
      const adminUser = await createUser({
        email: adminEmail,
        password: adminPassword,
        name: 'Administrator',
        role: 'admin',
        tenantId: tenant.id,
        isActive: true,
      });

      await createAuditLog(request, {
        tenantId: tenant.id,
        action: AuditActions.CREATE,
        entityType: 'user',
        entityId: adminUser.id,
        changes: { email: adminUser.email, role: adminUser.role },
      });
    } catch (userError: unknown) {
      // Log error but don't fail tenant creation if user creation fails
      logger.error('Failed to create admin user:', (userError as Error).message);
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
      data: { _id: tenant.id, ...tenant },
      adminUser: {
        email: adminEmail,
        password: adminPassword,
        note: 'Admin user created automatically. Please change the password after first login.'
      }
    }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const field = (error.meta?.target as string[] | undefined)?.[0] || 'field';
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
