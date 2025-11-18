import connectDB from './mongodb';
import Tenant from '@/models/Tenant';

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
 * Get tenant by slug
 */
export async function getTenantBySlug(slug: string): Promise<TenantInfo | null> {
  try {
    await connectDB();
    const tenant = await Tenant.findOne({ slug, isActive: true }).lean();
    
    if (!tenant) {
      return null;
    }

    return {
      _id: tenant._id.toString(),
      slug: tenant.slug,
      name: tenant.name,
      settings: tenant.settings,
    };
  } catch (error) {
    console.error('Error fetching tenant:', error);
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
      await connectDB();
      const tenant = await Tenant.findOne({ 
        $or: [
          { subdomain: subdomain },
          { domain: host }
        ],
        isActive: true 
      }).lean();
      
      if (tenant) {
        return {
          _id: tenant._id.toString(),
          slug: tenant.slug,
          name: tenant.name,
          settings: tenant.settings,
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching tenant from host:', error);
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

