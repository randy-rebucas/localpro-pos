/**
 * Business Type Helper Functions
 * 
 * Utilities for working with business types and industry-specific features
 */

import { getBusinessTypeConfig, BusinessType, getAllowedProductTypes, isValidBusinessType } from './business-types'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { ITenantSettings } from '@/types/tenant';
import { IProduct } from '@/models/Product';

/**
 * Get business type from tenant settings
 */
export function getBusinessType(settings?: ITenantSettings): BusinessType {
  if (!settings?.businessType) {
    return 'general';
  }
  const type = settings.businessType.toLowerCase();
  return isValidBusinessType(type) ? type : 'general';
}

/**
 * Check if business type supports a feature
 */
export function supportsFeature(
  settings: ITenantSettings | undefined,
  feature: 'inventory' | 'categories' | 'discounts' | 'loyalty' | 'customers' | 'booking'
): boolean {
  if (!settings) return false;
  
  const businessType = getBusinessType(settings);
  const config = getBusinessTypeConfig(businessType);
  
  switch (feature) {
    case 'inventory':
      return settings.enableInventory ?? config.defaultFeatures.enableInventory;
    case 'categories':
      return settings.enableCategories ?? config.defaultFeatures.enableCategories;
    case 'discounts':
      return settings.enableDiscounts ?? config.defaultFeatures.enableDiscounts;
    case 'loyalty':
      return settings.enableLoyaltyProgram ?? config.defaultFeatures.enableLoyaltyProgram;
    case 'customers':
      return settings.enableCustomerManagement ?? config.defaultFeatures.enableCustomerManagement;
    case 'booking':
      return settings.enableBookingScheduling ?? config.defaultFeatures.enableBookingScheduling;
    default:
      return false;
  }
}

/**
 * Get product fields relevant to business type
 */
export function getRelevantProductFields(product: IProduct, businessType?: BusinessType): Record<string, any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const relevant: Record<string, any> = { // eslint-disable-line @typescript-eslint/no-explicit-any
    id: product._id,
    name: product.name,
    description: product.description,
    price: product.price,
    productType: product.productType,
    image: product.image,
    categoryId: product.categoryId,
  };

  const type = businessType || 'general';

  // Retail-specific fields
  if (type === 'retail') {
    relevant.sku = product.sku;
    relevant.stock = product.stock;
    relevant.trackInventory = product.trackInventory;
    relevant.variations = product.variations;
    relevant.branchStock = product.branchStock;
  }

  return relevant;
}

/**
 * Validate product for business type
 */
export function validateProductForBusiness(
  product: Partial<IProduct>,
  settings: ITenantSettings
): { valid: boolean; errors: string[] } {
  const businessType = getBusinessType(settings);
  const config = getBusinessTypeConfig(businessType);
  const errors: string[] = [];

  // Check required fields
  if (config.requiredFields.includes('name') && (!product.name || !product.name.trim())) {
    errors.push('Product name is required');
  }

  if (config.requiredFields.includes('price') && (product.price === undefined || product.price < 0)) {
    errors.push('Product price is required and must be positive');
  }

  if (config.requiredFields.includes('sku') && businessType === 'retail' && !product.sku) {
    errors.push('SKU is required for retail products');
  }

  // Check product type
  if (product.productType && !config.productTypes.includes(product.productType)) {
    errors.push(
      `Product type "${product.productType}" is not allowed for ${config.name}. ` +
      `Allowed types: ${config.productTypes.join(', ')}`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get default product settings for business type
 */
export function getDefaultProductSettings(settings: ITenantSettings): Partial<IProduct> {
  const businessType = getBusinessType(settings);
  const config = getBusinessTypeConfig(businessType);

  const defaults: Partial<IProduct> = {
    productType: config.productTypes[0] || 'regular',
    trackInventory: config.defaultFeatures.enableInventory,
  };

  // Retail defaults
  if (businessType === 'retail') {
    defaults.trackInventory = true;
    defaults.allowOutOfStockSales = false;
  }

  return defaults;
}

/**
 * Format product for display based on business type
 */
export function formatProductForDisplay(
  product: IProduct,
  settings: ITenantSettings
): {
  title: string;
  price: string;
  details: string[];
} {
  const businessType = getBusinessType(settings);
  const details: string[] = [];

  const title = product.name;

  // Format based on business type
  if (businessType === 'retail') {
    if (product.sku) {
      details.push(`SKU: ${product.sku}`);
    }
    if (product.trackInventory) {
      details.push(`Stock: ${product.stock}`);
    }
  }

  return {
    title,
    price: `$${product.price.toFixed(2)}`,
    details,
  };
}
