import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import prisma, { dbTransaction } from '@/lib/db';
import { getDefaultTenantSettings } from '@/lib/currency';
import { validateEmail, validatePassword, validateTenant } from '@/lib/validation';
import { getValidationTranslator } from '@/lib/validation-translations';
import { applyBusinessTypeDefaults, omitFeatureFlagDefaults } from '@/lib/business-types';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { SubscriptionService } from '@/lib/subscription';
import { getPublicAppUrl } from '@/lib/ecommerce/public-url';
import { sendEmail } from '@/lib/notifications';
import { logger } from '@/lib/logger';
import { setBypassContext } from '@/lib/tenant-context';
import { flattenSettingsForPrisma } from '@/lib/tenant-settings-flatten';

/**
 * Public endpoint for tenant signup
 * Creates a new tenant and admin user without requiring authentication
 */
export async function POST(request: NextRequest) {
  let t: (key: string, fallback: string) => string;
  try {
    // No tenant exists yet — this endpoint creates one.
    setBypassContext();

    // Rate limiting: 3 store sign-ups per hour per IP
    const ip = getClientIp(request);
    const rl = checkRateLimit(`signup:${ip}`, 3, 60 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many signup attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetAfterMs / 1000)) } }
      );
    }

    const body = await request.json();
    const {
      // Tenant info
      slug,
      name,
      companyName,
      businessType,
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
    const existingTenant = await prisma.tenant.findFirst({
      where: { slug: slug.toLowerCase() },
    });

    if (existingTenant) {
      return NextResponse.json(
        { success: false, error: t('validation.storeIdentifierExists', 'A store with this identifier already exists. Please choose a different one.') },
        { status: 400 }
      );
    }

    // Check if admin email already exists
    const existingUser = await prisma.user.findFirst({ where: { email: adminEmail.toLowerCase() } });
    if (existingUser) {
      return NextResponse.json(
        { success: false, error: t('validation.emailExists', 'An account with this email already exists') },
        { status: 400 }
      );
    }

    // Get default settings and customize. Feature-flag keys are stripped
    // before merging so applyBusinessTypeDefaults() fills them from the
    // business type's config instead of these generic placeholders.
    const defaultSettings = getDefaultTenantSettings();
    const baseSettings: Record<string, unknown> = {
      ...omitFeatureFlagDefaults(defaultSettings as unknown as Record<string, unknown>),
      currency: currency || defaultSettings.currency,
      language: (language === 'es' ? 'es' : 'en') as 'en' | 'es',
      ...(contactEmail && { email: contactEmail }),
      ...(phone && { phone }),
      ...(companyName && { companyName }),
      businessType: businessType || defaultSettings.businessType || 'general',
    };

    // Always apply business type defaults so feature flags match the
    // tenant's business type (falls back to "general" when none is chosen).
    const mergedSettings = applyBusinessTypeDefaults(baseSettings, baseSettings.businessType as string);
    // getDefaultTenantSettings()/applyBusinessTypeDefaults() produce the
    // app-facing nested settings shape (e.g. settings.numberFormat); the
    // TenantSettings table is flat, so this must be flattened before Prisma
    // sees it or `tenant.create` throws on the first unrecognized key.
    const settings = flattenSettingsForPrisma(mergedSettings);

    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    // Tenant + admin user + trial subscription must all land together or not
    // at all — a signup that creates a tenant without a trial silently breaks
    // the "14-day free trial" promise on the marketing page, and there would
    // be no later trigger to retroactively create one for a self-serve tenant.
    const { tenant, adminUser } = await dbTransaction(async (tx) => {
      const newTenant = await tx.tenant.create({
        data: {
          id: randomUUID(),
          slug: slug.toLowerCase(),
          name,
          isActive: true,
          onboardingStatus: 'in_progress',
          settings: { create: settings as Record<string, unknown> },
        },
      });

      const newAdminUser = await tx.user.create({
        data: {
          id: randomUUID(),
          email: adminEmail.toLowerCase(),
          password: hashedPassword,
          name: adminName,
          role: 'admin',
          tenantId: newTenant.id,
          isActive: true,
        },
      });

      await SubscriptionService.ensureTrialSubscription(newTenant.id, tx);

      return { tenant: newTenant, adminUser: newAdminUser };
    });

    // Best-effort: the account and trial are already committed above, so a
    // delivery failure here shouldn't fail the signup response — but it is
    // awaited (rather than fire-and-forget) because serverless functions can
    // be frozen the instant the response is returned, silently dropping any
    // still-pending work. sendEmail() catches its own errors and resolves to
    // false rather than rejecting, so the result is checked, not caught.
    const storeUrl = `${getPublicAppUrl(request)}/${tenant.slug}/${lang}/login`;
    const emailSent = await sendEmail({
      to: adminUser.email,
      type: 'email',
      subject: `Your 1pos store "${tenant.name}" is ready`,
      message:
        `Welcome to 1pos!\n\n` +
        `Your store "${tenant.name}" has been created with a 14-day free trial — no credit card required.\n\n` +
        `Store link: ${storeUrl}\n` +
        `Login email: ${adminUser.email}\n\n` +
        `Sign in with the email and password you just created to get started.`,
    });
    if (!emailSent) {
      logger.error('Signup welcome email did not send', { tenantSlug: tenant.slug, to: adminUser.email });
    }

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
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (error.code === 'P2002') {
      const field = error.meta?.target?.[0] || 'field';
      return NextResponse.json(
        { success: false, error: `${field} already exists` },
        { status: 400 }
      );
    }
    logger.error('Signup error:', error);
    const errorMessage = error.message || 'Failed to create store. Please try again.';
    return NextResponse.json({
      success: false,
      error: errorMessage
    }, { status: 400 });
  }
}
