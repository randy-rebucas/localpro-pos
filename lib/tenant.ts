import connectDB from './mongodb';
import Tenant from '@/models/Tenant';
import { ITenantSettings } from '@/models/Tenant';
import { logger } from '@/lib/logger';
import { tenantCache } from '@/lib/db-cache';
import { normalizeHost } from '@/lib/host';

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
    await connectDB();
    return (await tenantCache.getOrLoad(`settings:${tenantId}`, async () => {
      const tenant = await Tenant.findById(tenantId).select('settings').lean();
      return tenant?.settings || null;
    })) as ITenantSettings | null;
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
    await connectDB();
    return (await tenantCache.getOrLoad(`slug:${slug}`, async () => {
      const tenant = await Tenant.findOne({ slug, isActive: true }).select('slug name settings').lean();
      if (!tenant) return null;
      return {
        _id: tenant._id.toString(),
        slug: tenant.slug,
        name: tenant.name,
        settings: tenant.settings,
      };
    })) as TenantInfo | null;
  } catch (error) {
    logger.error('Error fetching tenant:', error);
    return null;
  }
}

/**
 * Get tenant from request headers (for subdomain/domain routing)
 * @param host - The host header from the request
 */
export async function getTenantFromHost(rawHost: string): Promise<TenantInfo | null> {
  try {
    // Lowercase, strip port and trailing dot — stored domain/subdomain values
    // are lowercased by the Tenant schema, so lookups must match that form.
    const host = normalizeHost(rawHost);
    if (!host) return null;

    // Extract subdomain or use default
    const subdomain = host.split('.')[0];
    
    if (subdomain && subdomain !== 'www' && subdomain !== 'localhost' && subdomain !== '127.0.0.1') {
      await connectDB();
      return (await tenantCache.getOrLoad(`host:${host}`, async () => {
        const tenant = await Tenant.findOne({
          $or: [
            { subdomain: subdomain },
            { domain: host }
          ],
          isActive: true
        }).select('slug name settings').lean();
        if (!tenant) return null;
        return {
          _id: tenant._id.toString(),
          slug: tenant.slug,
          name: tenant.name,
          settings: tenant.settings,
        };
      })) as TenantInfo | null;
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

