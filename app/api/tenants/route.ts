import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import User from '@/models/User';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getDefaultTenantSettings } from '@/lib/currency';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    // Require admin role to list all tenants
    await requireRole(request, ['admin']);
    const tenants = await Tenant.find({ isActive: true }).select('slug name settings isActive createdAt').lean();
    return NextResponse.json({ success: true, data: tenants });
  } catch (error: unknown) {
    if ((error as Error).message === 'Unauthorized' || (error as Error).message.includes('Forbidden')) {
      return NextResponse.json(
        { success: false, error: (error as Error).message },
        { status: (error as Error).message === 'Unauthorized' ? 401 : 403 }
      );
    }
    return NextResponse.json({ success: false, error: 'Failed to fetch tenants' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    await requireRole(request, ['admin']);
    
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
    const existing = await Tenant.findOne({
      $or: [
        { slug: slug.toLowerCase() },
        ...(domain ? [{ domain }] : []),
        ...(subdomain ? [{ subdomain: subdomain.toLowerCase() }] : []),
      ]
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

    const tenantData: Record<string, unknown> = {
      slug: slug.toLowerCase(),
      name,
      settings,
      isActive: true,
    };

    if (domain) tenantData.domain = domain;
    if (subdomain) tenantData.subdomain = subdomain.toLowerCase();

    const tenant = await Tenant.create(tenantData);

    // Automatically create admin user for the tenant
    const adminEmail = `admin@${tenant.slug}.local`;
    const adminPassword = crypto.randomBytes(16).toString('base64url');
    
    try {
      const adminUser = await User.create({
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
        entityId: adminUser._id.toString(),
        changes: { email: adminUser.email, role: adminUser.role },
      });
    } catch (userError: unknown) {
      // Log error but don't fail tenant creation if user creation fails
      console.error('Failed to create admin user:', (userError as Error).message);
    }

    await createAuditLog(request, {
      tenantId: tenant._id,
      action: AuditActions.CREATE,
      entityType: 'tenant',
      entityId: tenant._id.toString(),
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
    if ((error as Record<string, unknown>).code === 11000) {
      const field = Object.keys((error as Record<string, Record<string, unknown>>).keyPattern)[0];
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

