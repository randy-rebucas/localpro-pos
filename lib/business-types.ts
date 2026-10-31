/**
 * Business Type Configuration System
 * 
 * Defines industry-specific configurations, features, and extensions
 * while maintaining consistency with the Standard POS Architecture Baseline
 */

export type BusinessType = 'retail' | 'general';

export interface BusinessTypeConfig {
  type: BusinessType;
  name: string;
  description: string;
  defaultFeatures: {
    enableInventory: boolean;
    enableCategories: boolean;
    enableDiscounts: boolean;
    enableLoyaltyProgram: boolean;
    enableCustomerManagement: boolean;
    enableBookingScheduling: boolean;
  };
  productTypes: ('regular' | 'bundle' | 'service')[];
  requiredFields: string[];
  optionalFields: string[];
  defaultSettings: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export const BUSINESS_TYPE_CONFIGS: Record<BusinessType, BusinessTypeConfig> = {
  retail: {
    type: 'retail',
    name: 'Retail Store',
    description: 'Physical or online retail store selling products',
    defaultFeatures: {
      enableInventory: true,
      enableCategories: true,
      enableDiscounts: true,
      enableLoyaltyProgram: true,
      enableCustomerManagement: true,
      enableBookingScheduling: false,
    },
    productTypes: ['regular', 'bundle'],
    requiredFields: ['name', 'price', 'sku'],
    optionalFields: ['description', 'image', 'variations', 'branchStock'],
    defaultSettings: {
      businessType: 'retail',
      enableInventory: true,
      enableCategories: true,
    },
  },
  general: {
    type: 'general',
    name: 'General Business',
    description: 'General purpose POS for any business type',
    defaultFeatures: {
      enableInventory: true,
      enableCategories: true,
      enableDiscounts: true,
      enableLoyaltyProgram: false,
      enableCustomerManagement: true,
      enableBookingScheduling: false,
    },
    productTypes: ['regular', 'bundle', 'service'],
    requiredFields: ['name', 'price'],
    optionalFields: ['description', 'image', 'sku'],
    defaultSettings: {
      businessType: 'general',
      enableInventory: true,
      enableCategories: true,
    },
  },
};

/**
 * Check whether a value is a supported business type (case-insensitive)
 */
export function isValidBusinessType(value: unknown): value is BusinessType {
  return typeof value === 'string'
    && Object.prototype.hasOwnProperty.call(BUSINESS_TYPE_CONFIGS, value.toLowerCase());
}

/**
 * Get business type configuration
 */
export function getBusinessTypeConfig(businessType?: string): BusinessTypeConfig {
  const type = (businessType?.toLowerCase() as BusinessType) || 'general';
  return BUSINESS_TYPE_CONFIGS[type] || BUSINESS_TYPE_CONFIGS.general;
}

/**
 * Get default features for a business type
 */
export function getDefaultFeatures(businessType?: string) {
  return getBusinessTypeConfig(businessType).defaultFeatures;
}

/**
 * Get default settings for a business type
 */
export function getDefaultSettings(businessType?: string) {
  return getBusinessTypeConfig(businessType).defaultSettings;
}

/**
 * Check if a feature is enabled by default for a business type
 */
export function isFeatureEnabled(businessType: string | undefined, feature: keyof BusinessTypeConfig['defaultFeatures']): boolean {
  const config = getBusinessTypeConfig(businessType);
  return config.defaultFeatures[feature];
}

/**
 * Get allowed product types for a business type
 */
export function getAllowedProductTypes(businessType?: string): ('regular' | 'bundle' | 'service')[] {
  return getBusinessTypeConfig(businessType).productTypes;
}

/**
 * Validate product against business type requirements
 */
export function validateProductForBusinessType(
  product: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  businessType?: string
): { valid: boolean; errors: string[] } {
  const config = getBusinessTypeConfig(businessType);
  const errors: string[] = [];

  // Check required fields
  for (const field of config.requiredFields) {
    if (!product[field] || (typeof product[field] === 'string' && !product[field].trim())) {
      errors.push(`${field} is required for ${config.name} businesses`);
    }
  }

  // Check product type
  if (product.productType && !config.productTypes.includes(product.productType)) {
    errors.push(`Product type "${product.productType}" is not allowed for ${config.name} businesses. Allowed types: ${config.productTypes.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Apply business type defaults to tenant settings
 */
export function applyBusinessTypeDefaults(settings: any, businessType?: string): any { // eslint-disable-line @typescript-eslint/no-explicit-any
  const config = getBusinessTypeConfig(businessType);
  const defaults = config.defaultSettings;
  
  return {
    ...settings,
    ...defaults,
    // Merge feature flags
    enableInventory: settings.enableInventory ?? config.defaultFeatures.enableInventory,
    enableCategories: settings.enableCategories ?? config.defaultFeatures.enableCategories,
    enableDiscounts: settings.enableDiscounts ?? config.defaultFeatures.enableDiscounts,
    enableLoyaltyProgram: settings.enableLoyaltyProgram ?? config.defaultFeatures.enableLoyaltyProgram,
    enableCustomerManagement: settings.enableCustomerManagement ?? config.defaultFeatures.enableCustomerManagement,
    enableBookingScheduling: settings.enableBookingScheduling ?? config.defaultFeatures.enableBookingScheduling,
  };
}

/**
 * Get industry-specific field suggestions
 */
export function getIndustryFields(businessType?: string): string[] {
  const config = getBusinessTypeConfig(businessType);
  return [...config.requiredFields, ...config.optionalFields];
}
