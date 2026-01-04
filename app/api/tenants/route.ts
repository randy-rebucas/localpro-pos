import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import User from '@/models/User';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getDefaultTenantSettings } from '@/lib/currency';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
  try {
    await connectDB();
    const tenants = await Tenant.find({ isActive: true }).select('slug name settings isActive createdAt').lean();
    return NextResponse.json({ success: true, data: tenants });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
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
    const adminPassword = `Admin${tenant.slug}123!`;
    
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
      console.error('Failed to create admin user:', userError.message);
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
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
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
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

