import TaxRule from '@/models/TaxRule';
import Tenant, { ITenantSettings } from '@/models/Tenant';
import Product from '@/models/Product'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { ITenant } from '@/models/Tenant'; // eslint-disable-line @typescript-eslint/no-unused-vars

/**
 * BIR (Bureau of Internal Revenue) Philippines discount rates
 * - Senior Citizens: 20% discount (RA 9994)
 * - Persons with Disability (PWD): 20% discount (RA 10754)
 * Both are VAT-exempt when applicable
 */
const BIR_DISCOUNT_CATEGORIES: Record<string, { rate: number; vatExempt: boolean }> = {
  senior: { rate: 20, vatExempt: true },
  pwd: { rate: 20, vatExempt: true },
};

/**
 * Calculate BIR-mandated discount and VAT exemption
 * Returns the discount amount and whether VAT should be exempt
 */
export function calculateBIRDiscount(
  subtotal: number,
  discountCategory?: string
): { birDiscountAmount: number; isVatExempt: boolean } {
  if (!discountCategory || !BIR_DISCOUNT_CATEGORIES[discountCategory]) {
    return { birDiscountAmount: 0, isVatExempt: false };
  }

  const config = BIR_DISCOUNT_CATEGORIES[discountCategory];
  // BIR mandates: discount computed on the VAT-exclusive price
  // VAT-exclusive = subtotal / 1.12 (assuming 12% VAT)
  const vatExclusivePrice = subtotal / 1.12;
  const birDiscountAmount = Math.round(vatExclusivePrice * (config.rate / 100) * 100) / 100;

  return {
    birDiscountAmount,
    isVatExempt: config.vatExempt,
  };
}

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
    taxExempt?: boolean;
    subtotal?: number;
  }>,
  tenantSettings?: ITenantSettings,
  discountCategory?: string
): Promise<{ taxAmount: number; taxRate: number; taxLabel: string; taxableAmount: number; exemptAmount: number }> {
  // Default values
  let taxAmount = 0;
  let taxRate = 0;
  let taxLabel = 'Tax';

  // BIR: Senior/PWD transactions are fully VAT-exempt
  if (discountCategory && BIR_DISCOUNT_CATEGORIES[discountCategory]?.vatExempt) {
    return {
      taxAmount: 0,
      taxRate: 0,
      taxLabel: `VAT Exempt (${discountCategory.toUpperCase()})`,
      taxableAmount: 0,
      exemptAmount: subtotalAfterDiscount,
    };
  }

  // Calculate exempt vs taxable amounts from item-level tax exemptions
  let exemptAmount = 0;
  let taxableAmount = subtotalAfterDiscount;

  const hasItemSubtotals = items.some(item => item.subtotal !== undefined);
  if (hasItemSubtotals) {
    const totalItemSubtotal = items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
    exemptAmount = items
      .filter(item => item.taxExempt)
      .reduce((sum, item) => sum + (item.subtotal || 0), 0);

    // Pro-rate the exempt amount against the discounted subtotal
    if (totalItemSubtotal > 0 && exemptAmount > 0) {
      const exemptRatio = exemptAmount / totalItemSubtotal;
      exemptAmount = Math.round(subtotalAfterDiscount * exemptRatio * 100) / 100;
    }
    taxableAmount = Math.max(0, subtotalAfterDiscount - exemptAmount);
  }

  // Try to get tax rules from TaxRule model first
  const taxRules = await TaxRule.find({
    tenantId,
    isActive: true,
  }).sort({ priority: -1 }).lean();

  // Only calculate tax on the taxable portion (excludes VAT-exempt items)
  if (taxRules.length > 0) {
    // Use TaxRule model - apply the highest priority matching rule
    for (const rule of taxRules) {
      let applies = false;

      // Check if rule applies to this transaction (only non-exempt items)
      const taxableItems = items.filter(item => !item.taxExempt);
      if (taxableItems.length === 0) break; // All items are exempt

      if (rule.appliesTo === 'all') {
        applies = true;
      } else if (rule.appliesTo === 'products') {
        applies = taxableItems.some(item => item.productType === 'regular' || item.productType === 'bundle');
      } else if (rule.appliesTo === 'services') {
        applies = taxableItems.some(item => item.productType === 'service');
      } else if (rule.appliesTo === 'categories') {
        if (rule.categoryIds && rule.categoryIds.length > 0) {
          applies = taxableItems.some(item =>
            item.categoryId && rule.categoryIds?.some(catId => catId.toString() === item.categoryId)
          );
        }
        // If no categoryIds specified on a category rule, skip to next rule
      }

      // Product-specific rules override appliesTo (only if productIds are specified)
      if (rule.productIds && rule.productIds.length > 0) {
        applies = taxableItems.some(item =>
          item.productId && rule.productIds?.some(prodId => prodId.toString() === item.productId)
        );
      }

      if (applies) {
        taxRate = Math.min(Math.max(rule.rate, 0), 100); // Clamp rate 0-100
        taxLabel = rule.label;
        taxAmount = (taxableAmount * taxRate) / 100;
        // Ensure tax doesn't exceed taxable amount
        taxAmount = Math.min(taxAmount, taxableAmount);
        break; // Use first matching rule
      }
    }
  } else {
    // Fall back to Tenant settings
    if (tenantSettings?.taxEnabled && tenantSettings.taxRate != null && tenantSettings.taxRate > 0) {
      taxRate = Math.min(Math.max(tenantSettings.taxRate, 0), 100);
      taxLabel = tenantSettings.taxLabel || 'Tax';
      taxAmount = (taxableAmount * taxRate) / 100;
      taxAmount = Math.min(taxAmount, taxableAmount);
    }
  }

  return {
    taxAmount: Math.round(taxAmount * 100) / 100, // Round to 2 decimal places
    taxRate,
    taxLabel,
    taxableAmount: Math.round(taxableAmount * 100) / 100,
    exemptAmount: Math.round(exemptAmount * 100) / 100,
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
