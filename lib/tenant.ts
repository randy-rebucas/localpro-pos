import connectDB from './mongodb';
import Tenant from '@/models/Tenant';
import { ITenantSettings } from '@/models/Tenant';
import { logger } from '@/lib/logger';
import { cacheWrap, CacheKeys, TTL } from '@/lib/cache';

export interface TenantInfo {
  _id: string;
  slug: string;
  name: string;
  domain?: string;
  subdomain?: string;
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
    // Read on every checkout and many routes — cached 60s, invalidated on tenant writes.
    // The returned object is shared; treat it as read-only.
    return await cacheWrap(CacheKeys.tenantSettings(String(tenantId)), TTL.DEFAULT, async () => {
      await connectDB();
      const tenant = await Tenant.findById(tenantId).select('settings').lean();
      return tenant?.settings || null;
    });
  } catch (error) {
    logger.error('Error fetching tenant settings:', error);
    return null;
  }
}

/**
 * Get tenant by slug.
 * Cached for 60s per instance and invalidated on tenant writes (models/Tenant.ts).
 * The returned object is shared — treat it as read-only.
 */
export async function getTenantBySlug(slug: string): Promise<TenantInfo | null> {
  try {
    return await cacheWrap(CacheKeys.tenantBySlug(slug), TTL.DEFAULT, async () => {
      await connectDB();
      const tenant = await Tenant.findOne({ slug, isActive: true }).select('slug name domain subdomain settings').lean();

      if (!tenant) {
        return null;
      }

      return {
        _id: tenant._id.toString(),
        slug: tenant.slug,
        name: tenant.name,
        domain: tenant.domain,
        subdomain: tenant.subdomain,
        settings: tenant.settings,
      };
    });
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
      // Misses are cached too — the platform's own host never matches a tenant
      // and would otherwise cost a read on every API request.
      return await cacheWrap(CacheKeys.tenantByHost(host), TTL.DEFAULT, async () => {
        await connectDB();
        const tenant = await Tenant.findOne({
          $or: [
            { subdomain: subdomain },
            { domain: host }
          ],
          isActive: true
        }).select('slug name domain subdomain settings').lean();

        if (!tenant) return null;
        return {
          _id: tenant._id.toString(),
          slug: tenant.slug,
          name: tenant.name,
          domain: tenant.domain,
          subdomain: tenant.subdomain,
          settings: tenant.settings,
        };
      });
    }

    return null;
  } catch (error) {
    logger.error('Error fetching tenant from host:', error);
    return null;
  }
}

/**
 * Get tenant ID from slug (for use in queries). Reads only `_id`.
 */
export async function getTenantId(slug: string): Promise<string | null> {
  try {
    return await cacheWrap(CacheKeys.tenantIdBySlug(slug), TTL.DEFAULT, async () => {
      await connectDB();
      const tenant = await Tenant.findOne({ slug, isActive: true }).select('_id').lean();
      return tenant ? tenant._id.toString() : null;
    });
  } catch (error) {
    logger.error('Error fetching tenant id:', error);
    return null;
  }
}

export interface TenantAuthInfo {
  isActive: boolean;
  rolePermissionOverrides?: ITenantSettings['rolePermissionOverrides'];
}

/**
 * Tenant fields needed on every authenticated request — the active flag (auth)
 * and role-permission overrides (permission checks). Cached for 60s.
 */
export async function getTenantAuthInfo(tenantId: string): Promise<TenantAuthInfo | null> {
  return cacheWrap(CacheKeys.tenantAuth(tenantId), TTL.DEFAULT, async () => {
    await connectDB();
    const tenant = await Tenant.findById(tenantId)
      .select('isActive settings.rolePermissionOverrides')
      .lean();
    if (!tenant) return null;
    return {
      isActive: !!tenant.isActive,
      rolePermissionOverrides: tenant.settings?.rolePermissionOverrides,
    };
  });
}
