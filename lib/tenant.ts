/**
 * ⚠️ TENANT-ISOLATION CRITICAL FILE ⚠️
 * These helpers resolve which tenant a request belongs to and are relied on
 * throughout the app to scope every query with `tenantId`. This file has a
 * documented history of a cross-tenant data leak (subscriptions endpoints
 * previously leaked cross-tenant data because tenant scoping was dropped).
 * Any change here must preserve tenant scoping in every function — never
 * return or resolve a tenant without an explicit, exact match on slug /
 * subdomain / domain / id, and never widen a `where` clause.
 */
import prisma from '@/lib/db';
import { ITenantSettings } from '@/types/tenant';
import { logger } from '@/lib/logger';

export interface TenantInfo {
  _id: string;
  slug: string;
  name: string;
  settings: {
    currency: string;
    timezone: string;
    language: 'en' | 'es';
    logo?: string;
    primaryColor?: string;
  };
}

/**
 * Get tenant settings by tenant ID
 */
export async function getTenantSettingsById(tenantId: string): Promise<ITenantSettings | null> {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    return (tenant?.settings as unknown as ITenantSettings) || null;
  } catch (error) {
    logger.error('Error fetching tenant settings:', error);
    return null;
  }
}

/**
 * Get tenant by slug
 */
export async function getTenantBySlug(slug: string): Promise<TenantInfo | null> {
  try {
    const tenant = await prisma.tenant.findFirst({
      where: { slug, isActive: true },
      include: { settings: true },
    });

    if (!tenant) {
      return null;
    }

    return {
      _id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      settings: {
        currency: tenant.settings?.currency ?? 'USD',
        timezone: tenant.settings?.timezone ?? 'Asia/Manila',
        language: (tenant.settings?.language as 'en' | 'es') ?? 'en',
        logo: tenant.settings?.logo ?? undefined,
        primaryColor: tenant.settings?.primaryColor ?? undefined,
      },
    };
  } catch (error) {
    logger.error('Error fetching tenant:', error);
    return null;
  }
}

/**
 * Get tenant from request headers (for subdomain/domain routing)
 * @param host - The host header from the request
 */
export async function getTenantFromHost(host: string): Promise<TenantInfo | null> {
  try {
    if (!host) return null;

    // Extract subdomain or use default
    const subdomain = host.split('.')[0];

    if (subdomain && subdomain !== 'www' && subdomain !== 'localhost' && subdomain !== '127.0.0.1') {
      const tenant = await prisma.tenant.findFirst({
        where: {
          OR: [{ subdomain }, { domain: host }],
          isActive: true,
        },
        include: { settings: true },
      });

      if (tenant) {
        return {
          _id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
          settings: {
            currency: tenant.settings?.currency ?? 'USD',
            timezone: tenant.settings?.timezone ?? 'Asia/Manila',
            language: (tenant.settings?.language as 'en' | 'es') ?? 'en',
            logo: tenant.settings?.logo ?? undefined,
            primaryColor: tenant.settings?.primaryColor ?? undefined,
          },
        };
      }
    }

    return null;
  } catch (error) {
    logger.error('Error fetching tenant from host:', error);
    return null;
  }
}

/**
 * Get tenant ID from slug (for use in queries)
 */
export async function getTenantId(slug: string): Promise<string | null> {
  const tenant = await getTenantBySlug(slug);
  return tenant?._id || null;
}
