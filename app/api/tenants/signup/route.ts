import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import User from '@/models/User';
import { getDefaultTenantSettings } from '@/lib/currency';
import { validateEmail, validatePassword, validateTenant } from '@/lib/validation';
import { getValidationTranslator } from '@/lib/validation-translations';

/**
 * Public endpoint for tenant signup
 * Creates a new tenant and admin user without requiring authentication
 */
export async function POST(request: NextRequest) {
  let t: (key: string, fallback: string) => string;
  try {
    await connectDB();
    
    const body = await request.json();
    const { 
      // Tenant info
      slug, 
      name, 
      companyName,
      // Admin user info
      adminEmail,
      adminPassword,
      adminName,
      // Optional settings
      currency,
      language,
      phone,
      email: contactEmail,
    } = body;

    // Get translation function based on selected language
    const lang = (language === 'es' ? 'es' : 'en') as 'en' | 'es';
    t = await getValidationTranslator(lang);

    // Validate tenant data
    const tenantErrors = validateTenant({ slug, name }, t);
    if (tenantErrors.length > 0) {
      return NextResponse.json(
        { success: false, error: tenantErrors[0].message },
        { status: 400 }
      );
    }

    // Validate admin user data
    if (!adminEmail || !adminPassword || !adminName) {
      return NextResponse.json(
        { success: false, error: t('validation.adminFieldsRequired', 'Admin email, password, and name are required') },
        { status: 400 }
      );
    }

    if (!validateEmail(adminEmail)) {
      return NextResponse.json(
        { success: false, error: t('validation.invalidEmailFormat', 'Invalid admin email format') },
        { status: 400 }
      );
    }

    const passwordValidation = validatePassword(adminPassword, t);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { success: false, error: 'Password validation failed', errors: passwordValidation.errors },
        { status: 400 }
      );
    }

    // Validate slug format (already validated in validateTenant, but keeping for consistency)
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return NextResponse.json(
        { success: false, error: t('validation.slugFormat', 'Slug can only contain lowercase letters, numbers, and hyphens') },
        { status: 400 }
      );
    }

    // Check if tenant already exists
    const existingTenant = await Tenant.findOne({
      $or: [
        { slug: slug.toLowerCase() },
      ]
    });

    if (existingTenant) {
      return NextResponse.json(
        { success: false, error: t('validation.storeIdentifierExists', 'A store with this identifier already exists. Please choose a different one.') },
        { status: 400 }
      );
    }

    // Check if admin email already exists
    const existingUser = await User.findOne({ email: adminEmail.toLowerCase() });
    if (existingUser) {
      return NextResponse.json(
        { success: false, error: t('validation.emailExists', 'An account with this email already exists') },
        { status: 400 }
      );
    }

    // Get default settings and customize
    const defaultSettings = getDefaultTenantSettings();
    const settings = {
      ...defaultSettings,
      currency: currency || defaultSettings.currency,
      language: (language === 'es' ? 'es' : 'en') as 'en' | 'es',
      ...(contactEmail && { email: contactEmail }),
      ...(phone && { phone }),
      ...(companyName && { companyName }),
    };

    // Create tenant
    const tenantData: any = {
      slug: slug.toLowerCase(),
      name,
      settings,
      isActive: true,
    };

    const tenant = await Tenant.create(tenantData);

    // Create admin user for the tenant
    const adminUser = await User.create({
      email: adminEmail.toLowerCase(),
      password: adminPassword,
      name: adminName,
      role: 'admin',
      tenantId: tenant._id,
      isActive: true,
    });

    return NextResponse.json({ 
      success: true, 
      data: {
        tenant: {
          slug: tenant.slug,
          name: tenant.name,
        },
        adminUser: {
          email: adminUser.email,
          name: adminUser.name,
        },
        message: t('validation.storeCreatedSuccess', 'Store created successfully! You can now login with your admin credentials.')
      }
    }, { status: 201 });
  } catch (error: any) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return NextResponse.json(
        { success: false, error: `${field} already exists` },
        { status: 400 }
      );
    }
    console.error('Signup error:', error);
    const errorMessage = error.message || 'Failed to create store. Please try again.';
    return NextResponse.json({ 
      success: false, 
      error: errorMessage
    }, { status: 400 });
  }
}

