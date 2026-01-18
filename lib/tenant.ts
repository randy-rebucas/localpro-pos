// Map features to required plans
const FEATURE_PLAN_MAP: Record<string, Array<string>> = {
  'multi-branch': ['business', 'enterprise'],
  'stock-transfer': ['business', 'enterprise'],
  'branch-analytics': ['business', 'enterprise'],
  'discounts': ['pro', 'business', 'enterprise'],
  'advanced-reports': ['pro', 'business', 'enterprise'],
  'custom-integrations': ['enterprise'],
  'dedicated-support': ['enterprise'],
  'unlimited-branches': ['enterprise'],
  // Add more as needed
};

/**
 * Checks if a feature is allowed for the given plan key.
 * @param planKey The current subscription plan key
 * @param feature The feature string (e.g. 'multi-branch')
 */
export function isFeatureAllowed(planKey: string, feature: string): boolean {
  if (!FEATURE_PLAN_MAP[feature]) return true; // If not mapped, allow by default
  return FEATURE_PLAN_MAP[feature].includes(planKey);
}
// Subscription plan definitions
export const SUBSCRIPTION_PLANS = [
  {
    key: 'starter',
    name: 'Starter',
    price: 999,
    currency: 'PHP',
    description: 'Micro businesses',
    features: [
      'Single branch',
      'Basic POS',
      'Inventory',
    ],
  },
  {
    key: 'pro',
    name: 'Pro',
    price: 1999,
    currency: 'PHP',
    description: 'Core MSMEs',
    features: [
      'Multi-user',
      'Advanced reports',
      'Discounts',
    ],
  },
  {
    key: 'business',
    name: 'Business',
    price: 3999,
    currency: 'PHP',
    description: 'Multi-branch',
    features: [
      'Multi-branch',
      'Stock transfer',
      'Branch analytics',
    ],
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    price: null,
    currency: 'PHP',
    description: 'Custom Chains',
    features: [
      'Custom integrations',
      'Dedicated support',
      'Unlimited branches',
    ],
  },
];

export function getPlanByKey(key: string) {
  return SUBSCRIPTION_PLANS.find((p) => p.key === key);
}
import connectDB from './mongodb';
import { ITenantSettings } from '@/models/Tenant';
// Do NOT import Tenant here to avoid circular dependency issues

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
    const tenant = await Tenant.findById(tenantId).select('settings').lean();
    return tenant?.settings || null;
  } catch (error) {
    console.error('Error fetching tenant settings:', error);
    return null;
  }
}

/**
 * Get tenant by slug
 */
export async function getTenantBySlug(slug: string): Promise<TenantInfo | null> {
  try {
    await connectDB();
    const { default: Tenant } = await import('@/models/Tenant');
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

