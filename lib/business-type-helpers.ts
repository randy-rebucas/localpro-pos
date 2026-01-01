/**
 * Business Type Helper Functions
 * 
 * Utilities for working with business types and industry-specific features
 */

import { getBusinessTypeConfig, BusinessType, getAllowedProductTypes } from './business-types';
import { ITenantSettings } from '@/models/Tenant';
import { IProduct } from '@/models/Product';

/**
 * Get business type from tenant settings
 */
export function getBusinessType(settings?: ITenantSettings): BusinessType {
  if (!settings?.businessType) {
    return 'general';
  }
  const type = settings.businessType.toLowerCase() as BusinessType;
  return ['retail', 'restaurant', 'laundry', 'service', 'general'].includes(type) ? type : 'general';
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
export function getRelevantProductFields(product: IProduct, businessType?: BusinessType): Record<string, any> {
  const relevant: Record<string, any> = {
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

  // Restaurant-specific fields
  if (type === 'restaurant') {
    relevant.modifiers = product.modifiers;
    relevant.allergens = product.allergens;
    relevant.nutritionInfo = product.nutritionInfo;
  }

  // Laundry-specific fields
  if (type === 'laundry') {
    relevant.serviceType = product.serviceType;
    relevant.weightBased = product.weightBased;
    relevant.pickupDelivery = product.pickupDelivery;
    relevant.estimatedDuration = product.estimatedDuration;
  }

  // Service-specific fields
  if (type === 'service') {
    relevant.serviceDuration = product.serviceDuration;
    relevant.staffRequired = product.staffRequired;
    relevant.equipmentRequired = product.equipmentRequired;
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

  // Business-specific validations
  if (businessType === 'restaurant' && product.modifiers) {
    for (const modifier of product.modifiers) {
      if (!modifier.name || !modifier.options || modifier.options.length === 0) {
        errors.push('Modifiers must have a name and at least one option');
      }
    }
  }

  if (businessType === 'laundry' && product.weightBased && product.price === undefined) {
    errors.push('Weight-based services must have a base price per unit');
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

  // Service defaults
  if (businessType === 'service' || businessType === 'laundry') {
    defaults.trackInventory = false;
    defaults.productType = 'service';
  }

  // Restaurant defaults
  if (businessType === 'restaurant') {
    defaults.trackInventory = true;
    defaults.productType = 'regular';
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
  subtitle?: string;
  price: string;
  details: string[];
} {
  const businessType = getBusinessType(settings);
  const details: string[] = [];

  let title = product.name;
  let subtitle: string | undefined;

  // Format based on business type
  if (businessType === 'restaurant') {
    if (product.allergens && product.allergens.length > 0) {
      details.push(`Allergens: ${product.allergens.join(', ')}`);
    }
    if (product.nutritionInfo?.calories) {
      details.push(`${product.nutritionInfo.calories} calories`);
    }
    if (product.modifiers && product.modifiers.length > 0) {
      details.push(`${product.modifiers.length} modifier${product.modifiers.length > 1 ? 's' : ''} available`);
    }
  }

  if (businessType === 'laundry') {
    if (product.serviceType) {
      subtitle = product.serviceType.charAt(0).toUpperCase() + product.serviceType.slice(1).replace('-', ' ');
    }
    if (product.estimatedDuration) {
      details.push(`Estimated: ${product.estimatedDuration} minutes`);
    }
    if (product.weightBased) {
      details.push('Price per unit weight');
    }
    if (product.pickupDelivery) {
      details.push('Pickup & Delivery available');
    }
  }

  if (businessType === 'service') {
    if (product.serviceDuration) {
      details.push(`Duration: ${product.serviceDuration} minutes`);
    }
    if (product.staffRequired && product.staffRequired > 1) {
      details.push(`${product.staffRequired} staff required`);
    }
  }

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
    subtitle,
    price: `$${product.price.toFixed(2)}`,
    details,
  };
}
