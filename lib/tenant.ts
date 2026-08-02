import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import type { ITenantSettings } from '@/types/tenant';

export type TenantSettings = ITenantSettings;

export interface TenantInfo {
  _id: string;
  slug: string;
  name: string;
  settings: TenantSettings;
}

/**
 * Get tenant settings by tenant ID
 */
export async function getTenantSettingsById(tenantId: string): Promise<TenantSettings | null> {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    return (tenant?.settings as TenantSettings | undefined) || null;
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
    const tenant = await prisma.tenant.findFirst({ where: { slug, isActive: true } });

    if (!tenant) {
      return null;
    }

    return {
      _id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      settings: tenant.settings as unknown as TenantSettings,
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
      });

      if (tenant) {
        return {
          _id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
          settings: tenant.settings as unknown as TenantSettings,
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
