import TaxRule from '@/models/TaxRule';
import Tenant, { ITenantSettings } from '@/models/Tenant';

/**
 * Calculate tax amount for a transaction
 * Uses TaxRule model if available, otherwise falls back to Tenant settings
 */
export async function calculateTax(
  tenantId: string,
  subtotalAfterDiscount: number,
  items: Array<{
    productId?: string;
    productType?: 'regular' | 'bundle' | 'service';
    categoryId?: string;
  }>,
  tenantSettings?: ITenantSettings
): Promise<{ taxAmount: number; taxRate: number; taxLabel: string }> {
  // Default values
  let taxAmount = 0;
  let taxRate = 0;
  let taxLabel = 'Tax';

  // Try to get tax rules from TaxRule model first
  const taxRules = await TaxRule.find({
    tenantId,
    isActive: true,
  }).sort({ priority: -1 }).lean();

  if (taxRules.length > 0) {
    // Use TaxRule model - apply the highest priority matching rule
    for (const rule of taxRules) {
      let applies = false;

      // Check if rule applies to this transaction
      if (rule.appliesTo === 'all') {
        applies = true;
      } else if (rule.appliesTo === 'products') {
        // Check if any item is a product
        applies = items.some(item => item.productType === 'regular' || item.productType === 'bundle');
      } else if (rule.appliesTo === 'services') {
        // Check if any item is a service
        applies = items.some(item => item.productType === 'service');
      } else if (rule.appliesTo === 'categories') {
        // Check if any item matches the category
        if (rule.categoryIds && rule.categoryIds.length > 0) {
          applies = items.some(item => 
            item.categoryId && rule.categoryIds?.some(catId => catId.toString() === item.categoryId)
          );
        }
      }

      // Check product-specific rules
      if (rule.productIds && rule.productIds.length > 0) {
        applies = items.some(item => 
          item.productId && rule.productIds?.some(prodId => prodId.toString() === item.productId)
        );
      }

      if (applies) {
        taxRate = rule.rate;
        taxLabel = rule.label;
        taxAmount = (subtotalAfterDiscount * taxRate) / 100;
        break; // Use first matching rule
      }
    }
  } else {
    // Fall back to Tenant settings
    if (tenantSettings?.taxEnabled && tenantSettings.taxRate) {
      taxRate = tenantSettings.taxRate;
      taxLabel = tenantSettings.taxLabel || 'Tax';
      taxAmount = (subtotalAfterDiscount * taxRate) / 100;
    }
  }

  return {
    taxAmount: Math.round(taxAmount * 100) / 100, // Round to 2 decimal places
    taxRate,
    taxLabel,
  };
}

/**
 * Get applicable tax rate for a product
 */
export async function getProductTaxRate(
  tenantId: string,
  productId: string,
  productType: 'regular' | 'bundle' | 'service',
  categoryId?: string
): Promise<number> {
  const taxRules = await TaxRule.find({
    tenantId,
    isActive: true,
  }).sort({ priority: -1 }).lean();

  if (taxRules.length > 0) {
    for (const rule of taxRules) {
      let applies = false;

      if (rule.appliesTo === 'all') {
        applies = true;
      } else if (rule.appliesTo === 'products' && (productType === 'regular' || productType === 'bundle')) {
        applies = true;
      } else if (rule.appliesTo === 'services' && productType === 'service') {
        applies = true;
      } else if (rule.appliesTo === 'categories' && categoryId) {
        applies = rule.categoryIds?.some(catId => catId.toString() === categoryId) || false;
      }

      if (rule.productIds && rule.productIds.length > 0) {
        applies = rule.productIds.some(prodId => prodId.toString() === productId);
      }

      if (applies) {
        return rule.rate;
      }
    }
  }

  // Fall back to tenant settings
  const tenant = await Tenant.findById(tenantId).lean();
  if (tenant?.settings?.taxEnabled && tenant.settings.taxRate) {
    return tenant.settings.taxRate;
  }

  return 0;
}
